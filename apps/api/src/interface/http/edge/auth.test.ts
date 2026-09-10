import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { requireRole, type Identity } from "./auth.js";
import { errorHandler } from "./error-handler.js";

function buildApp(identity: Identity | undefined) {
  const app = express();
  app.use((req, _res, next) => {
    req.identity = identity;
    next();
  });

  app.get("/admin-only", requireRole("admin"), (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.get("/any-authenticated", requireRole(), (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.use(errorHandler);
  return app;
}

describe("requireRole", () => {
  it("hides the resource from callers without an identity (NOT_FOUND_OR_FORBIDDEN, 404)", async () => {
    const res = await request(buildApp(undefined)).get("/admin-only");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      ok: false,
      error: { code: "NOT_FOUND_OR_FORBIDDEN", message: "Recurso no encontrado" }
    });
  });

  it("rejects an identity whose roles do not match with 403 FORBIDDEN", async () => {
    const res = await request(buildApp({ userId: "u1", roles: ["seller"] })).get("/admin-only");

    expect(res.status).toBe(403);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("allows an identity whose roles match", async () => {
    const res = await request(buildApp({ userId: "u1", roles: ["admin"] })).get("/admin-only");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("treats an empty role list as 'any authenticated identity'", async () => {
    const res = await request(buildApp({ userId: "u1", roles: ["seller"] })).get("/any-authenticated");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("still hides the resource when no identity is present, even with no role list", async () => {
    const res = await request(buildApp(undefined)).get("/any-authenticated");

    expect(res.status).toBe(404);
  });
});