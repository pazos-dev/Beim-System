/**
 * Rate limiter unit tests (DB-free: the middleware only imports the error
 * taxonomy, so these run in CI without Postgres).
 *
 * NOTE: the suite runs with NODE_ENV=test, which bypasses the limiter — each
 * test flips it to exercise the counters and restores it afterwards.
 */
import type { NextFunction, Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppError } from "../errors/AppError.js";
import { rateLimit, resetRateLimitStore } from "./rate-limit.js";

const PREV_ENV = process.env.NODE_ENV;

beforeEach(() => {
  process.env.NODE_ENV = "development";
  resetRateLimitStore();
});

afterEach(() => {
  process.env.NODE_ENV = PREV_ENV;
  resetRateLimitStore();
});

function hit(
  handler: ReturnType<typeof rateLimit>,
  opts: { ip?: string; path?: string } = {}
): unknown {
  let captured: unknown;
  let called = false;
  const next = ((err?: unknown) => {
    called = true;
    captured = err;
  }) as NextFunction;
  handler({ ip: opts.ip ?? "10.0.0.1", path: opts.path ?? "/auth/login" } as unknown as Request, {} as Response, next);
  expect(called).toBe(true);
  return captured;
}

describe("rateLimit", () => {
  it("allows up to max requests per window, then rejects with 429", () => {
    const limit = rateLimit(60_000, 2);
    expect(hit(limit)).toBeUndefined();
    expect(hit(limit)).toBeUndefined();
    const err = hit(limit);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ status: 429, code: "TOO_MANY_REQUESTS" });
  });

  it("tracks buckets independently per IP and path", () => {
    const limit = rateLimit(60_000, 1);
    expect(hit(limit, { ip: "10.0.0.1", path: "/a" })).toBeUndefined();
    expect(hit(limit, { ip: "10.0.0.2", path: "/a" })).toBeUndefined();
    expect(hit(limit, { ip: "10.0.0.1", path: "/b" })).toBeUndefined();
    const err = hit(limit, { ip: "10.0.0.1", path: "/a" });
    expect(err).toMatchObject({ status: 429 });
  });

  it("resets the window after it expires", async () => {
    const limit = rateLimit(30, 1);
    expect(hit(limit)).toBeUndefined();
    expect(hit(limit)).toMatchObject({ status: 429 });
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(hit(limit)).toBeUndefined();
  });

  it("bypasses entirely when NODE_ENV=test (integration suite)", () => {
    process.env.NODE_ENV = "test";
    const limit = rateLimit(60_000, 1);
    for (let i = 0; i < 5; i += 1) {
      expect(hit(limit)).toBeUndefined();
    }
  });
});
