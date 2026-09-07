/**
 * CORS allowlist unit tests (DB-free: the middleware imports only express
 * types, so these run in CI without Postgres).
 *
 * NOTE: the middleware reads `CORS_ORIGINS` per request — each test sets it
 * and the hooks below save/restore it.
 */
import type { NextFunction, Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cors, createCorsMiddleware } from "./cors.js";

const PREV_CORS_ORIGINS = process.env.CORS_ORIGINS;

beforeEach(() => {
  process.env.CORS_ORIGINS = "https://tienda.example.com";
});

afterEach(() => {
  if (PREV_CORS_ORIGINS === undefined) {
    delete process.env.CORS_ORIGINS;
  } else {
    process.env.CORS_ORIGINS = PREV_CORS_ORIGINS;
  }
  vi.restoreAllMocks();
});

interface Harness {
  req: Request;
  res: Response;
  setHeader: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  next: ReturnType<typeof vi.fn>;
}

function harness(opts: { origin?: string; method?: string } = {}): Harness {
  const setHeader = vi.fn();
  const end = vi.fn();
  const res = {
    setHeader,
    status: vi.fn().mockReturnThis(),
    end,
  } as unknown as Response;
  const req = {
    method: opts.method ?? "GET",
    headers: opts.origin === undefined ? {} : { origin: opts.origin },
  } as unknown as Request;
  const next = vi.fn() as unknown as ReturnType<typeof vi.fn>;
  return { req, res, setHeader, status: res.status as ReturnType<typeof vi.fn>, end, next: next as Harness["next"] };
}

function run(h: Harness): void {
  cors()(h.req, h.res, h.next as unknown as NextFunction);
}

describe("cors", () => {
  it("sets the exact origin + Vary on allowed GET and calls next()", () => {
    const h = harness({ origin: "https://tienda.example.com" });
    run(h);
    expect(h.setHeader).toHaveBeenCalledWith("Access-Control-Allow-Origin", "https://tienda.example.com");
    expect(h.setHeader).toHaveBeenCalledWith("Vary", "Origin");
    expect(h.next).toHaveBeenCalledTimes(1);
    expect(h.status).not.toHaveBeenCalled();
  });

  it("sets no headers for a foreign origin and calls next()", () => {
    const h = harness({ origin: "https://evil.example.com" });
    run(h);
    expect(h.setHeader).not.toHaveBeenCalled();
    expect(h.status).not.toHaveBeenCalled();
    expect(h.next).toHaveBeenCalledTimes(1);
  });

  it("passes through requests without Origin (curl/server-to-server)", () => {
    const h = harness();
    run(h);
    expect(h.setHeader).not.toHaveBeenCalled();
    expect(h.status).not.toHaveBeenCalled();
    expect(h.next).toHaveBeenCalledTimes(1);
  });

  it("passes everything through when CORS_ORIGINS is absent", () => {
    delete process.env.CORS_ORIGINS;
    const h = harness({ origin: "https://tienda.example.com" });
    run(h);
    expect(h.setHeader).not.toHaveBeenCalled();
    expect(h.status).not.toHaveBeenCalled();
    expect(h.next).toHaveBeenCalledTimes(1);
  });

  it("answers allowed preflights with 204 + methods/headers/max-age (no next)", () => {
    const h = harness({ origin: "https://tienda.example.com", method: "OPTIONS" });
    run(h);
    expect(h.setHeader).toHaveBeenCalledWith("Access-Control-Allow-Origin", "https://tienda.example.com");
    expect(h.setHeader).toHaveBeenCalledWith("Vary", "Origin");
    expect(h.setHeader).toHaveBeenCalledWith("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
    expect(h.setHeader).toHaveBeenCalledWith("Access-Control-Allow-Headers", "Content-Type, Authorization");
    expect(h.setHeader).toHaveBeenCalledWith("Access-Control-Max-Age", "86400");
    expect(h.setHeader).not.toHaveBeenCalledWith("Access-Control-Allow-Credentials", expect.anything());
    expect(h.status).toHaveBeenCalledWith(204);
    expect(h.end).toHaveBeenCalledTimes(1);
    expect(h.next).not.toHaveBeenCalled();
  });

  it("falls through on denied preflights (next, no response)", () => {
    const h = harness({ origin: "https://evil.example.com", method: "OPTIONS" });
    run(h);
    expect(h.setHeader).not.toHaveBeenCalled();
    expect(h.status).not.toHaveBeenCalled();
    expect(h.end).not.toHaveBeenCalled();
    expect(h.next).toHaveBeenCalledTimes(1);
  });

  it("ignores '*' entries (fail-closed: any origin gets nothing)", () => {
    process.env.CORS_ORIGINS = "*, https://tienda.example.com";
    const wildcard = harness({ origin: "https://anything.example.com" });
    run(wildcard);
    expect(wildcard.setHeader).not.toHaveBeenCalled();
    expect(wildcard.next).toHaveBeenCalledTimes(1);
  });

  it("trims entries and drops empties in the comma-separated list", () => {
    process.env.CORS_ORIGINS = "  https://a.example.com ,,https://b.example.com  ";
    const mw = createCorsMiddleware();
    const ok = harness({ origin: "https://b.example.com" });
    mw(ok.req, ok.res, ok.next as unknown as NextFunction);
    expect(ok.setHeader).toHaveBeenCalledWith("Access-Control-Allow-Origin", "https://b.example.com");
    const other = harness({ origin: "https://c.example.com" });
    mw(other.req, other.res, other.next as unknown as NextFunction);
    expect(other.setHeader).not.toHaveBeenCalled();
  });
});
