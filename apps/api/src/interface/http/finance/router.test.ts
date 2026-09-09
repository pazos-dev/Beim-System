import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { NotFoundError, ValidationError } from "../../../errors/taxonomy.js";
import type { Identity } from "../edge/auth.js";
import type { FinanceRouterDeps } from "./router.js";
import { createFinanceRouter } from "./router.js";

const OPERATOR: Identity = { userId: "11111111-1111-4111-8111-111111111111", roles: ["caja"] };
const ADMIN: Identity = { userId: "22222222-2222-4222-8222-222222222222", roles: ["administrador"] };
const PRINCIPAL: Identity = { userId: "33333333-3333-4333-8333-333333333333", roles: ["administrador_principal"] };
const CLIENTE: Identity = { userId: "44444444-4444-4444-8444-444444444444", roles: ["cliente"] };

const TEMPLATE = { warranty: "30 días de garantía por mano de obra", footer: "Gracias por su visita" };
const MOVEMENT = { productId: "p1", movementType: "entrada", quantity: 5, detail: "compra" };

function baseFakes(): FinanceRouterDeps {
  return {
    getFinancialState: vi.fn(async () => ({ singletonId: 1, capitalInitial: 0 })),
    upsertFinancialState: vi.fn(async (patch: unknown) => ({ singletonId: 1, patch })),
    getInvoiceSettings: vi.fn(async () => ({ ...TEMPLATE })),
    saveInvoiceSettings: vi.fn(async (doc: unknown) => ({ ...TEMPLATE, ...(doc as object) })),
    listStockMovements: vi.fn(async (filter: unknown) => ({ movements: [], filter })),
    recordStockMovement: vi.fn(async (input: unknown, actor: unknown) => ({ recorded: true, input, actor }))
  };
}

function testApp(fakes: FinanceRouterDeps, identity: Identity | null = OPERATOR): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());
  app.use((req, _res, next) => {
    if (identity !== null) req.identity = identity;
    next();
  });
  app.use("/api/v1", createFinanceRouter(fakes));
  return app;
}

describe("finance thin router (validate -> handler -> envelope)", () => {
  it("reads financial-state with 200 through the handler", async () => {
    const res = await request(testApp(baseFakes())).get("/api/v1/financial-state");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, data: { singletonId: 1, capitalInitial: 0 } });
  });

  it("upserts financial-state with 200 forwarding the partial patch", async () => {
    const fakes = baseFakes();
    const patch = { capitalInitial: 5000, preferences: { theme: "dark" } };
    const res = await request(testApp(fakes)).put("/api/v1/financial-state").send(patch);
    expect(res.status).toBe(200);
    expect(fakes.upsertFinancialState).toHaveBeenCalledWith(patch);
  });

  it("rejects unknown financial-state keys with 422 without touching the handler", async () => {
    const fakes = baseFakes();
    const res = await request(testApp(fakes)).put("/api/v1/financial-state").send({ hacked: 1 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(fakes.upsertFinancialState).not.toHaveBeenCalled();
  });

  it("reads invoice-settings as operator and saves as principal with 200", async () => {
    const read = await request(testApp(baseFakes())).get("/api/v1/invoice-settings");
    expect(read.status).toBe(200);
    expect(read.body).toEqual({ ok: true, data: TEMPLATE });
    const fakes = baseFakes();
    const saved = await request(testApp(fakes, PRINCIPAL)).put("/api/v1/invoice-settings").send(TEMPLATE);
    expect(saved.status).toBe(200);
    expect(fakes.saveInvoiceSettings).toHaveBeenCalledWith(TEMPLATE);
  });

  it("rejects PUT invoice-settings for administrador with 403 without touching the handler", async () => {
    const fakes = baseFakes();
    const res = await request(testApp(fakes, ADMIN)).put("/api/v1/invoice-settings").send(TEMPLATE);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(fakes.saveInvoiceSettings).not.toHaveBeenCalled();
  });

  it("lists stock-movements forwarding the filter and records with 201 plus the journal actor", async () => {
    const fakes = baseFakes();
    const list = await request(testApp(fakes)).get("/api/v1/stock-movements").query({ productId: "p1" });
    expect(list.status).toBe(200);
    expect(fakes.listStockMovements).toHaveBeenCalledWith({ productId: "p1", from: undefined, to: undefined });
    const recorded = await request(testApp(fakes)).post("/api/v1/stock-movements").send(MOVEMENT);
    expect(recorded.status).toBe(201);
    expect(fakes.recordStockMovement).toHaveBeenCalledWith(MOVEMENT, {
      actorUserId: OPERATOR.userId,
      actorRole: "caja"
    });
  });

  it("rejects bad movement types with 422 and renders unknown products as the frozen 404", async () => {
    const fakes = baseFakes();
    const badType = await request(testApp(fakes))
      .post("/api/v1/stock-movements")
      .send({ ...MOVEMENT, movementType: "transferencia" });
    expect(badType.status).toBe(422);
    expect(fakes.recordStockMovement).not.toHaveBeenCalled();
    const unknown = await request(
      testApp({
        ...baseFakes(),
        recordStockMovement: vi.fn(async () => {
          throw new NotFoundError("Producto no encontrado: no-existe");
        })
      })
    )
      .post("/api/v1/stock-movements")
      .send({ ...MOVEMENT, productId: "no-existe" });
    expect(unknown.status).toBe(404);
    expect(unknown.body).toEqual({
      ok: false,
      error: { code: "NOT_FOUND_OR_FORBIDDEN", message: "Producto no encontrado: no-existe" }
    });
  });

  it("applies the operator gate: no identity 404, cliente role 403; handler errors surface 422", async () => {
    const anon = await request(testApp(baseFakes(), null)).get("/api/v1/financial-state");
    expect(anon.status).toBe(404);
    const cliente = await request(testApp(baseFakes(), CLIENTE)).get("/api/v1/invoice-settings");
    expect(cliente.status).toBe(403);
    const invalid = await request(
      testApp({
        ...baseFakes(),
        upsertFinancialState: vi.fn(async () => {
          throw new ValidationError("El capital inicial no puede ser negativo");
        })
      })
    )
      .put("/api/v1/financial-state")
      .send({ capitalInitial: -10 });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.code).toBe("VALIDATION_ERROR");
  });
});
