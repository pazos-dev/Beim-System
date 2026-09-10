import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { NotFoundError } from "../../../errors/taxonomy.js";
import type { Identity } from "../edge/auth.js";
import type { CajaRouterDeps } from "./router.js";
import { createCajaRouter } from "./router.js";

const OPERATOR: Identity = { userId: "11111111-1111-4111-8111-111111111111", roles: ["caja"] };
const CLIENTE: Identity = { userId: "22222222-2222-4222-8222-222222222222", roles: ["cliente"] };
const SESSION_ID = "33333333-3333-4333-8333-333333333333";

function baseFakes(): CajaRouterDeps {
  return {
    current: vi.fn(async () => ({ id: SESSION_ID, status: "open" })),
    list: vi.fn(async () => [{ id: SESSION_ID }]),
    open: vi.fn(async (input: unknown) => ({ id: SESSION_ID, ...(input as Record<string, unknown>) })),
    close: vi.fn(async (id: string, countedAmount: number) => ({ id, countedAmount })),
    recordMovement: vi.fn(async (id: string, input: unknown) => ({ id, ...(input as Record<string, unknown>) }))
  };
}

function testApp(overrides: Partial<CajaRouterDeps> = {}, identity: Identity | null = OPERATOR): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());
  app.use((req, _res, next) => {
    if (identity !== null) req.identity = identity;
    next();
  });
  app.use("/api/v1", createCajaRouter({ ...baseFakes(), ...overrides }));
  return app;
}

const VALID_OPEN = { businessDate: "2026-09-09", openingAmount: 5000 };

describe("caja thin router (validate -> handler -> envelope)", () => {
  it("opens with 201 and passes the parsed body to the handler", async () => {
    const fakes = baseFakes();
    const res = await request(testApp(fakes)).post("/api/v1/cash-sessions").send(VALID_OPEN);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true, data: { id: SESSION_ID, ...VALID_OPEN } });
    expect(fakes.open).toHaveBeenCalledWith(VALID_OPEN);
  });

  it("rejects unknown open keys with the frozen 422 envelope", async () => {
    const fakes = baseFakes();
    const res = await request(testApp(fakes))
      .post("/api/v1/cash-sessions")
      .send({ ...VALID_OPEN, hacked: 1 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(fakes.open).not.toHaveBeenCalled();
  });

  it("closes with 200 through the handler", async () => {
    const fakes = baseFakes();
    const res = await request(testApp(fakes))
      .post(`/api/v1/cash-sessions/${SESSION_ID}/close`)
      .send({ countedAmount: 5100 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, data: { id: SESSION_ID, countedAmount: 5100 } });
    expect(fakes.close).toHaveBeenCalledWith(SESSION_ID, 5100);
  });

  it("rejects negative countedAmount with 422 without touching the handler", async () => {
    const fakes = baseFakes();
    const res = await request(testApp(fakes))
      .post(`/api/v1/cash-sessions/${SESSION_ID}/close`)
      .send({ countedAmount: -1 });
    expect(res.status).toBe(422);
    expect(fakes.close).not.toHaveBeenCalled();
  });

  it("records movements with 201 including the audit actor", async () => {
    const fakes = baseFakes();
    const res = await request(testApp(fakes))
      .post(`/api/v1/cash-sessions/${SESSION_ID}/movements`)
      .send({ type: "ingreso", amount: 200 });
    expect(res.status).toBe(201);
    expect(fakes.recordMovement).toHaveBeenCalledWith(
      SESSION_ID,
      { type: "ingreso", amount: 200 },
      { actorUserId: OPERATOR.userId, actorRole: "caja" }
    );
  });

  it("rejects unknown movement types with 422", async () => {
    const fakes = baseFakes();
    const res = await request(testApp(fakes))
      .post(`/api/v1/cash-sessions/${SESSION_ID}/movements`)
      .send({ type: "robo", amount: 200 });
    expect(res.status).toBe(422);
    expect(fakes.recordMovement).not.toHaveBeenCalled();
  });

  it("reads current with 200 and maps null to the frozen 404", async () => {
    const ok = await request(testApp()).get("/api/v1/cash-sessions/current");
    expect(ok.status).toBe(200);
    const missing = await request(testApp({ current: vi.fn(async () => null) })).get(
      "/api/v1/cash-sessions/current"
    );
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("NOT_FOUND_OR_FORBIDDEN");
  });

  it("lists with 200 through the handler", async () => {
    const res = await request(testApp()).get("/api/v1/cash-sessions");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, data: [{ id: SESSION_ID }] });
  });

  it("applies the operator gate: no identity 404, cliente role 403", async () => {
    const anon = await request(testApp({}, null)).get("/api/v1/cash-sessions");
    expect(anon.status).toBe(404);
    const cliente = await request(testApp({}, CLIENTE)).get("/api/v1/cash-sessions");
    expect(cliente.status).toBe(403);
  });

  it("renders handler NotFoundError as the frozen 404 envelope", async () => {
    const res = await request(
      testApp({ close: vi.fn(async () => { throw new NotFoundError(`Sesión de caja no encontrada: ${SESSION_ID}`); }) })
    )
      .post(`/api/v1/cash-sessions/${SESSION_ID}/close`)
      .send({ countedAmount: 1 });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      ok: false,
      error: { code: "NOT_FOUND_OR_FORBIDDEN", message: `Sesión de caja no encontrada: ${SESSION_ID}` }
    });
  });
});
