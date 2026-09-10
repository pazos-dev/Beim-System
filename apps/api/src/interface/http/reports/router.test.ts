import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { ValidationError } from "../../../errors/taxonomy.js";
import type { Identity } from "../edge/auth.js";
import type { ReportsRouterDeps } from "./router.js";
import { createReportsRouter } from "./router.js";

const OPERATOR: Identity = { userId: "11111111-1111-4111-8111-111111111111", roles: ["caja"] };
const CLIENTE: Identity = { userId: "22222222-2222-4222-8222-222222222222", roles: ["cliente"] };

function baseFakes(): ReportsRouterDeps {
  return {
    salesSummary: vi.fn(async (range: unknown) => ({ range })),
    stockValuation: vi.fn(async () => ({ totalValuation: 0 })),
    cashSummary: vi.fn(async (range: unknown) => ({ range })),
    topProducts: vi.fn(async (query: unknown) => ({ query })),
    repairsByStatus: vi.fn(async () => ({ total: 0 }))
  };
}

function testApp(overrides: Partial<ReportsRouterDeps> = {}, identity: Identity | null = OPERATOR): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());
  app.use((req, _res, next) => {
    if (identity !== null) req.identity = identity;
    next();
  });
  app.use("/api/v1", createReportsRouter({ ...baseFakes(), ...overrides }));
  return app;
}

describe("reports thin router (validate -> handler -> envelope)", () => {
  it("reads sales-summary with 200 forwarding the parsed range", async () => {
    const fakes = baseFakes();
    const res = await request(testApp(fakes)).get("/api/v1/reports/sales-summary?from=2026-08-11&to=2026-09-09");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, data: { range: { from: "2026-08-11", to: "2026-09-09" } } });
    expect(fakes.salesSummary).toHaveBeenCalledWith({ from: "2026-08-11", to: "2026-09-09" });
  });

  it("reads stock-valuation and repairs-by-status with 200 and no input", async () => {
    const stock = await request(testApp()).get("/api/v1/reports/stock-valuation");
    expect(stock.status).toBe(200);
    expect(stock.body).toEqual({ ok: true, data: { totalValuation: 0 } });
    const repairs = await request(testApp()).get("/api/v1/reports/repairs-by-status");
    expect(repairs.status).toBe(200);
    expect(repairs.body).toEqual({ ok: true, data: { total: 0 } });
  });

  it("reads cash-summary and top-products forwarding range and limit", async () => {
    const fakes = baseFakes();
    const cash = await request(testApp(fakes)).get("/api/v1/reports/cash-summary?from=2026-08-11");
    expect(cash.status).toBe(200);
    expect(fakes.cashSummary).toHaveBeenCalledWith({ from: "2026-08-11", to: undefined });
    const top = await request(testApp(fakes)).get("/api/v1/reports/top-products?limit=5");
    expect(top.status).toBe(200);
    expect(fakes.topProducts).toHaveBeenCalledWith({ from: undefined, to: undefined, limit: 5 });
  });

  it("rejects unknown query keys and over-limit tops with 422 without touching handlers", async () => {
    const fakes = baseFakes();
    const unknown = await request(testApp(fakes)).get("/api/v1/reports/sales-summary?hacked=1");
    expect(unknown.status).toBe(422);
    expect(unknown.body.error.code).toBe("VALIDATION_ERROR");
    const over = await request(testApp(fakes)).get("/api/v1/reports/top-products?limit=500");
    expect(over.status).toBe(422);
    expect(fakes.salesSummary).not.toHaveBeenCalled();
    expect(fakes.topProducts).not.toHaveBeenCalled();
  });

  it("applies the operator gate: no identity 404, cliente role 403", async () => {
    const anon = await request(testApp({}, null)).get("/api/v1/reports/sales-summary");
    expect(anon.status).toBe(404);
    const cliente = await request(testApp({}, CLIENTE)).get("/api/v1/reports/sales-summary");
    expect(cliente.status).toBe(403);
  });

  it("renders handler ValidationError as the frozen 422 envelope", async () => {
    const res = await request(
      testApp({
        salesSummary: vi.fn(async () => {
          throw new ValidationError("El rango de fechas es inválido: from no puede ser posterior a to");
        })
      })
    ).get("/api/v1/reports/sales-summary?from=2026-09-09&to=2026-08-11");
    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "El rango de fechas es inválido: from no puede ser posterior a to" }
    });
  });
});
