/**
 * Rate-limit store unit tests (DB-free: the middleware and both stores only
 * import the error taxonomy plus ioredis types, so these run in CI without
 * Postgres and without Redis).
 *
 * NOTE: the suite runs with NODE_ENV=test, which bypasses the limiter — each
 * test flips it to exercise the counters and restores it afterwards (same
 * pattern as rate-limit.test.ts, which stays untouched).
 */
import type { NextFunction, Request, Response } from "express";
import type { Redis } from "ioredis";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../errors/AppError.js";
import { rateLimit, resetRateLimitStore } from "./rate-limit.js";
import {
  MemoryRateLimitStore,
  RedisRateLimitStore,
  type RateLimitHit,
  type RateLimitStore
} from "./rate-limit-store.js";

const PREV_ENV = process.env.NODE_ENV;
const PREV_RATE_LIMIT_URL = process.env.RATE_LIMIT_REDIS_URL;
const PREV_REDIS_URL = process.env.REDIS_URL;

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  process.env.NODE_ENV = "development";
  delete process.env.RATE_LIMIT_REDIS_URL;
  delete process.env.REDIS_URL;
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  resetRateLimitStore();
});

afterEach(() => {
  process.env.NODE_ENV = PREV_ENV;
  if (PREV_RATE_LIMIT_URL === undefined) delete process.env.RATE_LIMIT_REDIS_URL;
  else process.env.RATE_LIMIT_REDIS_URL = PREV_RATE_LIMIT_URL;
  if (PREV_REDIS_URL === undefined) delete process.env.REDIS_URL;
  else process.env.REDIS_URL = PREV_REDIS_URL;
  warnSpy.mockRestore();
  resetRateLimitStore();
});

function hit(
  handler: ReturnType<typeof rateLimit>,
  opts: { ip?: string; path?: string } = {}
): Promise<unknown> {
  return new Promise((resolve) => {
    const next = ((err?: unknown) => resolve(err)) as NextFunction;
    handler(
      { ip: opts.ip ?? "10.0.0.1", path: opts.path ?? "/auth/login" } as unknown as Request,
      {} as Response,
      next
    );
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Test double for RateLimitStore: fixed-window counting with a fail switch. */
class FakeStore implements RateLimitStore {
  readonly seen: Array<{ key: string; windowMs: number }> = [];
  private readonly counts = new Map<string, RateLimitHit>();
  fail = false;

  async hit(key: string, windowMs: number): Promise<RateLimitHit> {
    this.seen.push({ key, windowMs });
    if (this.fail) throw new Error("store boom");
    const now = Date.now();
    const current = this.counts.get(key);
    if (current === undefined || now >= current.resetAt) {
      const fresh = { count: 1, resetAt: now + windowMs };
      this.counts.set(key, fresh);
      return { ...fresh };
    }
    current.count += 1;
    return { ...current };
  }

  async clear(): Promise<void> {
    this.counts.clear();
  }
}

describe("rateLimit with an injected store", () => {
  it("counts through the store and rejects past max with 429", async () => {
    const fake = new FakeStore();
    const limit = rateLimit(60_000, 2, fake);
    expect(await hit(limit)).toBeUndefined();
    expect(await hit(limit)).toBeUndefined();
    const err = await hit(limit);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ status: 429, code: "TOO_MANY_REQUESTS" });
    expect(fake.seen).toHaveLength(3);
    expect(fake.seen[0]).toEqual({ key: "10.0.0.1:/auth/login", windowMs: 60_000 });
  });

  it("tracks keys independently per IP and path", async () => {
    const fake = new FakeStore();
    const limit = rateLimit(60_000, 1, fake);
    expect(await hit(limit, { ip: "10.0.0.1", path: "/a" })).toBeUndefined();
    expect(await hit(limit, { ip: "10.0.0.2", path: "/a" })).toBeUndefined();
    expect(await hit(limit, { ip: "10.0.0.1", path: "/b" })).toBeUndefined();
    expect(await hit(limit, { ip: "10.0.0.1", path: "/a" })).toMatchObject({ status: 429 });
  });

  it("resets the window after it expires", async () => {
    const fake = new FakeStore();
    const limit = rateLimit(30, 1, fake);
    expect(await hit(limit)).toBeUndefined();
    expect(await hit(limit)).toMatchObject({ status: 429 });
    await sleep(40);
    expect(await hit(limit)).toBeUndefined();
  });

  it("fails open (allows the request) when the store rejects", async () => {
    const fake = new FakeStore();
    fake.fail = true;
    const limit = rateLimit(60_000, 1, fake);
    expect(await hit(limit)).toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
  });
});

describe("default store hook", () => {
  it("resetRateLimitStore still clears the default memory counters", async () => {
    const limit = rateLimit(60_000, 1);
    expect(await hit(limit)).toBeUndefined();
    expect(await hit(limit)).toMatchObject({ status: 429 });
    resetRateLimitStore();
    expect(await hit(limit)).toBeUndefined();
  });
});

describe("MemoryRateLimitStore", () => {
  it("counts per key and expires windows with a short TTL", async () => {
    const store = new MemoryRateLimitStore();
    expect(await store.hit("k", 30)).toMatchObject({ count: 1 });
    expect(await store.hit("k", 30)).toMatchObject({ count: 2 });
    expect(await store.hit("other", 30)).toMatchObject({ count: 1 });
    await sleep(40);
    expect(await store.hit("k", 30)).toMatchObject({ count: 1 });
  });

  it("clear resets every counter", async () => {
    const store = new MemoryRateLimitStore();
    await store.hit("k", 60_000);
    await store.hit("k", 60_000);
    await store.clear();
    expect(await store.hit("k", 60_000)).toMatchObject({ count: 1 });
  });
});

function fakeClient(overrides: Record<string, unknown> = {}): Redis {
  return {
    status: "ready",
    eval: vi.fn().mockResolvedValue([1, 60_000]),
    scan: vi.fn().mockResolvedValue(["0", []]),
    del: vi.fn().mockResolvedValue(0),
    disconnect: vi.fn(),
    on: vi.fn(),
    ...overrides
  } as unknown as Redis;
}

describe("RedisRateLimitStore (fake client: no Redis server needed)", () => {
  it("increments atomically via Lua with prefixed keys and TTL-derived reset", async () => {
    const client = fakeClient({ eval: vi.fn().mockResolvedValue([3, 45_000]) });
    const store = new RedisRateLimitStore(client);
    const before = Date.now();
    const result = await store.hit("10.0.0.1:/auth/login", 60_000);
    const after = Date.now();
    expect(result.count).toBe(3);
    expect(result.resetAt).toBeGreaterThanOrEqual(before + 45_000);
    expect(result.resetAt).toBeLessThanOrEqual(after + 45_000);
    const evalMock = client.eval as unknown as ReturnType<typeof vi.fn>;
    expect(evalMock).toHaveBeenCalledTimes(1);
    const [script, numKeys, key, window] = evalMock.mock.calls[0] as [
      string,
      number,
      string,
      string
    ];
    expect(script).toContain("INCR");
    expect(script).toContain("PEXPIRE");
    expect(script).toContain("PTTL");
    expect(numKeys).toBe(1);
    expect(key).toBe("ratelimit:10.0.0.1:/auth/login");
    expect(window).toBe("60000");
  });

  it("falls back to memory counters (fail-open) when Redis rejects", async () => {
    const client = fakeClient({ eval: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) });
    const store = new RedisRateLimitStore(client);
    expect(await store.hit("k", 60_000)).toMatchObject({ count: 1 });
    expect(await store.hit("k", 60_000)).toMatchObject({ count: 2 });
    expect(warnSpy).toHaveBeenCalled();
  });

  it("clear only deletes keys under the ratelimit prefix", async () => {
    const scan = vi.fn().mockResolvedValue(["0", ["ratelimit:a", "ratelimit:b"]]);
    const del = vi.fn().mockResolvedValue(2);
    const client = fakeClient({ scan, del });
    const store = new RedisRateLimitStore(client);
    await store.clear();
    expect(scan).toHaveBeenCalledWith("0", "MATCH", "ratelimit:*", "COUNT", 100);
    expect(del).toHaveBeenCalledWith("ratelimit:a", "ratelimit:b");
  });
});
