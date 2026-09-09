import express from "express";
import request from "supertest";
import { describe, expect, it, vi, type Mock } from "vitest";
import type { Venta } from "../../../domain/venta/venta.js";
import type { Pago } from "../../../domain/pago/pago.js";
import { AppError } from "../../../errors/AppError.js";
import { ERROR_CODES } from "../../../errors/taxonomy.js";
import { renderError } from "../errorHandler.js";
import { createVentaRouter, type VentaRouterDeps } from "./router.js";

const VENTA_ID = "11111111-1111-4111-8111-111111111111";
const ORDER_ID = "33333333-3333-4333-8333-333333333333";
const PRODUCT_ID = "22222222-2222-4222-8222-222222222222";

const VALID_BATCH = {
  ventaId: VENTA_ID,
  lines: [{ productId: PRODUCT_ID, quantity: 2 }],
  payments: [{ method: "efectivo", amount: 100, currency: "UYU" }]
};

const VALID_ORDER = {
  orderId: ORDER_ID,
  lines: [{ productId: PRODUCT_ID, quantity: 1 }]
};

const VALID_CHECKOUT = { orderId: ORDER_ID };

type MockDeps = VentaRouterDeps & {
  confirmBatch: Mock;
  createOrder: Mock;
  mintCheckoutSession: Mock;
};

/** Canned handler results: shape is opaque to the router (envelope only). */
function okDeps(): MockDeps {
  const venta = { id: VENTA_ID } as unknown as Venta;
  return {
    confirmBatch: vi.fn(async () => ({ venta, products: [] })),
    createOrder: vi.fn(async () => ({ venta, pago: { id: "pago-1" } as unknown as Pago })),
    mintCheckoutSession: vi.fn(async () => ({ venta, pago: { id: "pago-1" } as unknown as Pago }))
  };
}

function buildApp(deps: VentaRouterDeps): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());
  app.use(createVentaRouter(deps));
  return app;
}

describe("venta thin router (validate-handler-envelope only)", () => {
  it("confirms a counter batch with 201 and the frozen success envelope", async () => {
    const deps = okDeps();
    const res = await request(buildApp(deps)).post("/sales-batch").send(VALID_BATCH);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true, data: await deps.confirmBatch.mock.results[0].value });
    expect(deps.confirmBatch).toHaveBeenCalledTimes(1);
    expect(deps.confirmBatch).toHaveBeenCalledWith(VALID_BATCH);
  });

  it("creates a webshop order with 201 and the frozen success envelope", async () => {
    const deps = okDeps();
    const res = await request(buildApp(deps)).post("/orders").send(VALID_ORDER);
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(deps.createOrder).toHaveBeenCalledWith(VALID_ORDER);
  });

  it("mints a checkout session with 201 and the frozen success envelope", async () => {
    const deps = okDeps();
    const res = await request(buildApp(deps)).post("/checkout-sessions").send(VALID_CHECKOUT);
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(deps.mintCheckoutSession).toHaveBeenCalledWith(VALID_CHECKOUT);
  });

  it("rejects unknown body keys with 422 before any handler runs", async () => {
    const deps = okDeps();
    const res = await request(buildApp(deps))
      .post("/sales-batch")
      .send({ ...VALID_BATCH, unknown: "x" });
    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "VALIDATION_ERROR" })
    });
    expect(deps.confirmBatch).not.toHaveBeenCalled();
  });

  it("rejects non-uuid ids with 422 before any handler runs", async () => {
    const deps = okDeps();
    const res = await request(buildApp(deps))
      .post("/orders")
      .send({ orderId: "not-a-uuid", lines: [{ productId: PRODUCT_ID, quantity: 1 }] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(deps.createOrder).not.toHaveBeenCalled();
  });

  it("rejects an empty lines array with 422", async () => {
    const deps = okDeps();
    const res = await request(buildApp(deps)).post("/orders").send({ orderId: ORDER_ID, lines: [] });
    expect(res.status).toBe(422);
    expect(deps.createOrder).not.toHaveBeenCalled();
  });

  it.each([
    ["AUTHENTICATION_REQUIRED", "Autenticación requerida", ERROR_CODES.AUTHENTICATION_REQUIRED, 401],
    ["FORBIDDEN", "No tiene permisos para realizar esta operación", ERROR_CODES.FORBIDDEN, 403],
    ["NOT_FOUND_OR_FORBIDDEN", "Recurso no encontrado", ERROR_CODES.NOT_FOUND_OR_FORBIDDEN, 404]
  ] as const)("renders %s as %i with the frozen envelope", async (code, message, statusCode, expected) => {
    const deps = okDeps();
    deps.confirmBatch.mockRejectedValueOnce(new AppError(code, message, statusCode));
    const res = await request(buildApp(deps)).post("/sales-batch").send(VALID_BATCH);
    const baseline = renderError(new AppError(code, message, statusCode));
    expect(res.status).toBe(expected);
    expect(res.body).toEqual(baseline.body);
  });

  it("renders unknown handler failures as 500 without leaking the cause", async () => {
    const deps = okDeps();
    deps.createOrder.mockRejectedValueOnce(new Error("secreto pg://internal"));
    const res = await request(buildApp(deps)).post("/orders").send(VALID_ORDER);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "Error interno del servidor" }
    });
    expect(JSON.stringify(res.body)).not.toContain("secreto");
  });
});
