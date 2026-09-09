/**
 * Edge parity (PR7 re-home): frozen behavior through the canonical
 * `src/interface/http/edge/` imports — zero semantic change.
 * DB-free: mirrors the middleware unit contracts via the new paths.
 */
import type { NextFunction, Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { requireRole } from "./auth.js";
import { cors, createCorsMiddleware } from "./cors.js";
import { rateLimit, resetRateLimitStore } from "./rate-limit.js";
import { securityHeaders } from "./security-headers.js";
import { validate } from "./validate.js";

const PREV_ENV = process.env.NODE_ENV;
const PREV_CORS = process.env.CORS_ORIGINS;

function mockRes() {
  const setHeader = vi.fn();
  const status = vi.fn();
  const end = vi.fn();
  const res = { setHeader, status, end } as unknown as Response;
  return { res, setHeader, status, end };
}

function nextCapture() {
  let captured: unknown;
  let called = false;
  const next = ((err?: unknown) => {
    called = true;
    captured = err;
  }) as NextFunction;
  return { next, called: () => called, err: () => captured };
}

beforeEach(() => {
  process.env.NODE_ENV = "development";
  process.env.CORS_ORIGINS = "https://tienda.example.com";
  resetRateLimitStore();
});

afterEach(() => {
  process.env.NODE_ENV = PREV_ENV;
  if (PREV_CORS === undefined) delete process.env.CORS_ORIGINS;
  else process.env.CORS_ORIGINS = PREV_CORS;
  resetRateLimitStore();
  vi.restoreAllMocks();
});

describe("edge parity", () => {
  it("CORS allowlist drops `*` and unknown origins get no headers", () => {
    const mw = createCorsMiddleware({ origins: ["*", "https://tienda.example.com"] });
    const { res, setHeader } = mockRes();
    const { next } = nextCapture();
    mw({ headers: { origin: "https://evil.example.com" }, method: "GET" } as unknown as Request, res, next);
    expect(setHeader).not.toHaveBeenCalled();
  });

  it("CORS allowlisted origin echoes without credentials (Bearer, not cookies)", () => {
    const { res, setHeader } = mockRes();
    const { next } = nextCapture();
    cors()({ headers: { origin: "https://tienda.example.com" }, method: "GET" } as unknown as Request, res, next);
    expect(setHeader).toHaveBeenCalledWith("Access-Control-Allow-Origin", "https://tienda.example.com");
    const names = setHeader.mock.calls.map((c) => String(c[0]).toLowerCase());
    expect(names).not.toContain("access-control-allow-credentials");
  });

  it("Bearer gate: no identity → 404, wrong role → 403", () => {
    const gate = requireRole("admin");
    const pass = nextCapture();
    gate({ identity: undefined } as unknown as Request, {} as Response, pass.next);
    expect(pass.err()).toMatchObject({ status: 404 });
    const denied = nextCapture();
    gate({ identity: { userId: "u1", roles: ["caja"] } } as unknown as Request, {} as Response, denied.next);
    expect(denied.err()).toMatchObject({ status: 403 });
  });

  it("429 on rate-limit breach via the re-homed limiter", () => {
    const limit = rateLimit(60_000, 1);
    const hit = () => {
      const c = nextCapture();
      limit({ ip: "10.9.9.9", path: "/edge/probe" } as unknown as Request, {} as Response, c.next);
      return c.err();
    };
    expect(hit()).toBeUndefined();
    expect(hit()).toMatchObject({ status: 429 });
  });

  it("validate rejects unknown keys with 422 details via the re-homed adapter", () => {
    const mw = validate(z.object({ name: z.string() }).strict());
    const c = nextCapture();
    mw({ body: { name: "x", hacked: true } } as unknown as Request, {} as Response, c.next);
    expect(c.err()).toMatchObject({ status: 422 });
  });

  it("security-headers sets the frozen trio via the re-homed adapter", () => {
    const { res, setHeader } = mockRes();
    const { next } = nextCapture();
    securityHeaders({} as Request, res, next);
    expect(setHeader).toHaveBeenCalledWith("X-Content-Type-Options", "nosniff");
    expect(setHeader).toHaveBeenCalledWith("Referrer-Policy", "no-referrer");
    expect(setHeader).toHaveBeenCalledWith("X-Frame-Options", "DENY");
  });
});
