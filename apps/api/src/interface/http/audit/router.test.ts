import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { ValidationError } from "../../../errors/taxonomy.js";
import type { Identity } from "../edge/auth.js";
import type { AuditRouterDeps } from "./router.js";
import { createAuditRouter } from "./router.js";

const ADMIN: Identity = { userId: "11111111-1111-4111-8111-111111111111", roles: ["administrador"] };
const CAJA: Identity = { userId: "22222222-2222-4222-8222-222222222222", roles: ["caja"] };
const ACTOR = "33333333-3333-4333-8333-333333333333";

function baseFakes(): AuditRouterDeps {
  return {
    listAudits: vi.fn(async (query: unknown) => ({ query }))
  };
}

function testApp(overrides: Partial<AuditRouterDeps> = {}, identity: Identity | null = ADMIN): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());
  app.use((req, _res, next) => {
    if (identity !== null) req.identity = identity;
    next();
  });
  app.use("/api/v1", createAuditRouter({ ...baseFakes(), ...overrides }));
  return app;
}

describe("audit thin router (validate -> handler -> envelope)", () => {
  it("reads audit-logs with 200 mapping actor to the handler filter", async () => {
    const fakes = baseFakes();
    const res = await request(testApp(fakes)).get(
      `/api/v1/audit-logs?action=order.create&actor=${ACTOR}&from=2026-08-11&to=2026-09-09&page=2&limit=10`
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      data: {
        query: {
          action: "order.create",
          actorUserId: ACTOR,
          from: "2026-08-11",
          to: "2026-09-09",
          page: 2,
          limit: 10
        }
      }
    });
    expect(fakes.listAudits).toHaveBeenCalledWith({
      action: "order.create",
      actorUserId: ACTOR,
      from: "2026-08-11",
      to: "2026-09-09",
      page: 2,
      limit: 10
    });
  });

  it("rejects unknown query keys, non-uuid actors and over-limit pages with 422 without touching handlers", async () => {
    const fakes = baseFakes();
    const unknown = await request(testApp(fakes)).get("/api/v1/audit-logs?hacked=1");
    expect(unknown.status).toBe(422);
    expect(unknown.body.error.code).toBe("VALIDATION_ERROR");
    const badActor = await request(testApp(fakes)).get("/api/v1/audit-logs?actor=not-a-uuid");
    expect(badActor.status).toBe(422);
    const over = await request(testApp(fakes)).get("/api/v1/audit-logs?limit=500");
    expect(over.status).toBe(422);
    expect(fakes.listAudits).not.toHaveBeenCalled();
  });

  it("applies the admin gate: no identity 404, caja role 403", async () => {
    const anon = await request(testApp({}, null)).get("/api/v1/audit-logs");
    expect(anon.status).toBe(404);
    const caja = await request(testApp({}, CAJA)).get("/api/v1/audit-logs");
    expect(caja.status).toBe(403);
  });

  it("renders handler ValidationError as the frozen 422 envelope", async () => {
    const res = await request(
      testApp({
        listAudits: vi.fn(async () => {
          throw new ValidationError("El filtro de auditoría es inválido");
        })
      })
    ).get("/api/v1/audit-logs");
    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "El filtro de auditoría es inválido" }
    });
  });
});
