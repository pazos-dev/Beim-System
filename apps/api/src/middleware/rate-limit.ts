import type { NextFunction, Request, RequestHandler, Response } from "express";
import { TooManyRequestsError } from "../errors/taxonomy.js";

/**
 * Fixed-window in-memory rate limiter (no new dependencies).
 *
 * Keyed by client IP + route path. `NODE_ENV=test` bypasses it so the
 * integration suite (dozens of rapid localhost requests per process) is not
 * throttled; the middleware itself is unit-tested with NODE_ENV flipped
 * (see rate-limit.test.ts).
 *
 * Single-instance scope: with 2+ instances behind a balancer each keeps its
 * own counters — for multi-instance deployments replace the Map with a
 * shared store (Redis) behind the same `rateLimit(windowMs, max)` shape.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

const MAX_BUCKETS = 10_000;

/** Test hook: clear all counters. */
export function resetRateLimitStore(): void {
  buckets.clear();
}

function sweepExpired(now: number): void {
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}

export function rateLimit(windowMs: number, max: number): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (process.env.NODE_ENV === "test") {
      next();
      return;
    }
    const now = Date.now();
    if (buckets.size >= MAX_BUCKETS) sweepExpired(now);
    const key = `${req.ip ?? "unknown"}:${req.path}`;
    const bucket = buckets.get(key);
    if (bucket === undefined || now >= bucket.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    bucket.count += 1;
    if (bucket.count > max) {
      next(new TooManyRequestsError());
      return;
    }
    next();
  };
}
