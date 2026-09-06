/**
 * Bearer identity resolver unit tests (DB-free: the verify fn is injected,
 * so these run in CI without Postgres).
 */
import type { Request } from "express";
import { describe, expect, it } from "vitest";
import request from "supertest";
import type { SessionTokenClaims } from "./ports.js";

// Same deal as app.test.ts: the module graph under test pulls config/db.ts,
// which requires DATABASE_URL at load time (it builds the shared Pool).
// Point it at the test database: this suite never issues a query (the verify
// fn is injected), so no connection is ever opened.
process.env.DATABASE_URL ??= "postgres://beim@127.0.0.1:5432/beim_api_test";

const { createApp } = await import("../../app.js");
const { createBearerIdentityResolver } = await import("./webshop-token.js");

function reqWith(authHeader: string | undefined): Request {
  return { headers: authHeader === undefined ? {} : { authorization: authHeader } } as unknown as Request;
}

function explodingVerify(): (token: string) => Promise<SessionTokenClaims | null> {
  return () => {
    throw new Error("verify must not be called without a Bearer token");
  };
}

describe("createBearerIdentityResolver", () => {
  it("returns undefined without calling verify when the header is missing", async () => {
    const resolve = createBearerIdentityResolver(explodingVerify());
    await expect(resolve(reqWith(undefined))).resolves.toBeUndefined();
  });

  it("returns undefined for a malformed scheme", async () => {
    const resolve = createBearerIdentityResolver(explodingVerify());
    await expect(resolve(reqWith("Token abc123"))).resolves.toBeUndefined();
  });

  it("returns undefined for an empty Bearer token", async () => {
    const resolve = createBearerIdentityResolver(explodingVerify());
    await expect(resolve(reqWith("Bearer   "))).resolves.toBeUndefined();
  });

  it("returns undefined for unknown/expired sessions (verify → null)", async () => {
    const resolve = createBearerIdentityResolver(() => Promise.resolve(null));
    await expect(resolve(reqWith("Bearer stale-token"))).resolves.toBeUndefined();
  });

  it("maps session claims to { userId, roles }", async () => {
    const resolve = createBearerIdentityResolver(() =>
      Promise.resolve({ userId: "u-1", role: "admin" })
    );
    await expect(resolve(reqWith("Bearer good-token"))).resolves.toEqual({
      userId: "u-1",
      roles: ["admin"]
    });
  });
});

describe("createApp with an async resolver", () => {
  it("awaits the resolver before routing (identity visible to gates)", async () => {
    const app = createApp({
      resolveIdentity: async () => ({ userId: "u-async", roles: ["admin"] })
    });
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
  });

  it("fails loud (500, no leak) when the resolver throws", async () => {
    const app = createApp({
      resolveIdentity: () => {
        throw new Error("boom (must not leak)");
      }
    });
    const res = await request(app).get("/health");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ ok: false, error: { code: "INTERNAL_ERROR", message: expect.any(String) } });
    expect(JSON.stringify(res.body)).not.toContain("boom");
  });
});
