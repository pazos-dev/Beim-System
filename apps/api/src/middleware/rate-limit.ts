import type { NextFunction, Request, RequestHandler, Response } from "express";
import { TooManyRequestsError } from "../errors/taxonomy.js";
import {
  MemoryRateLimitStore,
  RedisRateLimitStore,
  type RateLimitHit,
  type RateLimitStore
} from "./rate-limit-store.js";

export type { RateLimitHit, RateLimitStore };

/**
 * Fixed-window rate limiter, keyed by client IP + route path.
 *
 * `NODE_ENV=test` bypasses it so the integration suite (dozens of rapid
 * localhost requests per process) is not throttled; the middleware itself is
 * unit-tested with NODE_ENV flipped (see rate-limit.test.ts).
 *
 * Scope: single-instance counters by default; set `RATE_LIMIT_REDIS_URL` (or
 * the generic `REDIS_URL` fallback) for shared multi-instance counters. The
 * default store resolves lazily on the first non-test hit, so processes
 * without the env var never touch Redis.
 */

// Process-wide default: one memory store, at most one Redis store (rebuilt if
// the env var changes, e.g. between tests).
const memoryStore = new MemoryRateLimitStore();
let redisStore: RedisRateLimitStore | undefined;
let redisUrlInUse: string | undefined;

function redisUrl(): string | undefined {
  return process.env.RATE_LIMIT_REDIS_URL ?? process.env.REDIS_URL;
}

function defaultStore(): RateLimitStore {
  const url = redisUrl();
  if (url === undefined) return memoryStore;
  if (redisStore === undefined || redisUrlInUse !== url) {
    redisStore?.disconnect();
    redisStore = RedisRateLimitStore.fromUrl(url);
    redisUrlInUse = url;
  }
  return redisStore;
}

/** Test hook: clear all counters of the default store. */
export function resetRateLimitStore(): void {
  const result = defaultStore().clear();
  // Memory clears synchronously (existing sync test contract); a Redis clear
  // rejection (unreachable server) must never throw out of a test hook.
  if (result instanceof Promise) result.catch(() => undefined);
}

/** Release the shared Redis connection, if any (server shutdown path). */
export function closeRateLimitStore(): void {
  redisStore?.disconnect();
  redisStore = undefined;
  redisUrlInUse = undefined;
}

function isPromise(value: RateLimitHit | Promise<RateLimitHit>): value is Promise<RateLimitHit> {
  return value instanceof Promise;
}

function decide(count: number, max: number, next: NextFunction): void {
  if (count > max) {
    next(new TooManyRequestsError());
    return;
  }
  next();
}

export function rateLimit(windowMs: number, max: number, store?: RateLimitStore): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (process.env.NODE_ENV === "test") {
      next();
      return;
    }
    const active = store ?? defaultStore();
    let result: RateLimitHit | Promise<RateLimitHit>;
    try {
      result = active.hit(`${req.ip ?? "unknown"}:${req.path}`, windowMs);
    } catch {
      // A broken custom store must never take the API down (fail-open).
      next();
      return;
    }
    if (isPromise(result)) {
      result.then(
        ({ count }) => decide(count, max, next),
        // Same fail-open contract for async backends that reject instead of
        // falling back internally. No request data in the log (no IPs).
        () => {
          console.warn("[rate-limit] store error, allowing request");
          next();
        }
      );
      return;
    }
    decide(result.count, max, next);
  };
}
