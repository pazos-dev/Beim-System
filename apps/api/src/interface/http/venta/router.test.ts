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
const USER_ID = "99999999-9999-4999-8999-999999999999";
const GENERATED_ID = "44444444-4444-4444-8444-444444444444";
const SESSION_ID = "55555555-5555-4555-8555-555555555555";
const BASE_URL = "https://checkout.beim.test";
const EXPIRES_AT = new Date("2026-04-01T10:30:00.000Z");

const VALID_BATCH = {
  ventaId: VENTA_ID,
  clientName: "Cliente Batch",
  clientId: "api-cli-5",
  deviceBrand: "Samsung",
  deviceModel: "A15",
  imeiSerial: "358000000000001",
  reportedIssue: "Pantalla rota",
  services: ["Cambio de pantalla"],
  lines: [{ productId: PRODUCT_ID, quantity: 2 }],
  payments: [{ method: "Efectivo", amount: 200 }]
};

/** Legacy webshop order body (no orderId — the edge generates it). */
const VALID_ORDER = {
  customer: "Comprador Web",
  email: "buyer@beim.test",
  items: [{ productId: PRODUCT_ID, quantity: 1 }]
};

const VALID_CHECKOUT = { orderId: ORDER_ID, paymentMethodId: "transferencia-bancaria" };

type MockDeps = VentaRouterDeps & {
  confirmBatch: Mock;
  createOrder: Mock;
  mintCheckoutSession: Mock;
};

/** Canned handler results: order shape is opaque, checkout is envelope-shaped. */
function okDeps(): MockDeps {
  const venta = { id: VENTA_ID } as unknown as Venta;
  const batchVenta = {
    id: VENTA_ID,
    lines: [
      {
        productId: PRODUCT_ID,
        quantity: 2,
        unitPrice: { amount: 100, currency: "UYU" },
        allocations: []
      }
    ],
    total: { amount: 200, currency: "UYU" }
  } as unknown as Venta;
  const minted = {
    id: VENTA_ID,
    checkoutSession: {
      id: SESSION_ID,
      ventaId: VENTA_ID,
      status: "pending",
      createdAt: new Date("2026-04-01T10:00:00.000Z"),
      expiresAt: EXPIRES_AT,
      paymentMethodId: "transferencia-bancaria"
    }
  } as unknown as Venta;
  const pago = { id: "pago-1" } as unknown as Pago;
  return {
    confirmBatch: vi.fn(async () => ({ venta: batchVenta, products: [] })),
    createOrder: vi.fn(async () => ({ venta, pago })),
    mintCheckoutSession: vi.fn(async () => ({ venta: minted, pago })),
    uuid: { generate: () => GENERATED_ID },
    checkoutBaseUrl: BASE_URL
  };
}

function buildApp(deps: VentaRouterDeps, userId: string | null = USER_ID): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());
  if (userId !== null) {
    app.use((req, _res, next) => {
      req.identity = { userId, roles: [] };
      next();
    });
  }
  app.use(createVentaRouter(deps));
  return app;
}

describe("venta thin router (validate-handler-envelope only)", () => {
  it("confirms a counter batch with 201 and the legacy {receipt, items, total} envelope", async () => {
    const deps = okDeps();
    const res = await request(buildApp(deps)).post("/sales-batch").send(VALID_BATCH);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      ok: true,
      data: {
        receipt: await deps.confirmBatch.mock.results[0].value.then((r: { venta: Venta }) => r.venta),
        items: [{ productId: PRODUCT_ID, quantity: 2, unitPrice: 100 }],
        total: 200
      }
    });
    expect(deps.confirmBatch).toHaveBeenCalledTimes(1);
    expect(deps.confirmBatch).toHaveBeenCalledWith({
      ...VALID_BATCH,
      clientPhone: null,
      deviceColor: null,
      userId: USER_ID
    });
  });

  it("fails closed with 404 on sales-batch when no identity is wired", async () => {
    const deps = okDeps();
    const res = await request(buildApp(deps, null)).post("/sales-batch").send(VALID_BATCH);
    expect(res.status).toBe(404);
    expect(deps.confirmBatch).not.toHaveBeenCalled();
  });

  it("accepts the legacy items shape without ventaId with 201, mapping items→lines", async () => {
    const deps = okDeps();
    const res = await request(buildApp(deps))
      .post("/sales-batch")
      .send({
        clientName: "Martín Rodríguez",
        clientId: "taller-cli-1",
        clientPhone: "+598 99 123 456",
        deviceModel: "iPhone 13",
        reportedIssue: "Pantalla rota",
        items: [{ productId: PRODUCT_ID, quantity: 1 }],
        payments: [{ method: "efectivo", amount: 200 }]
      });
    expect(res.status).toBe(201);
    expect(deps.confirmBatch).toHaveBeenCalledTimes(1);
    expect(deps.confirmBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        clientName: "Martín Rodríguez",
        clientId: "taller-cli-1",
        lines: [{ productId: PRODUCT_ID, quantity: 1 }],
        userId: USER_ID
      })
    );
    const called = deps.confirmBatch.mock.calls[0][0] as { ventaId: string };
    expect(called.ventaId).toBe(GENERATED_ID);
  });

  it("rejects a legacy items batch without clientId with 422", async () => {
    const deps = okDeps();
    const res = await request(buildApp(deps))
      .post("/sales-batch")
      .send({ clientName: "Sin Documento", items: [{ productId: PRODUCT_ID, quantity: 1 }] });
    expect(res.status).toBe(422);
    expect(deps.confirmBatch).not.toHaveBeenCalled();
  });

  it("rejects a sales-batch without clientName with 422 before any handler runs", async () => {
    const deps = okDeps();
    const { clientName: _dropped, ...noClient } = VALID_BATCH;
    void _dropped;
    const res = await request(buildApp(deps)).post("/sales-batch").send(noClient);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(deps.confirmBatch).not.toHaveBeenCalled();
  });

  it("creates a webshop order from the legacy body with 201", async () => {
    const deps = okDeps();
    const res = await request(buildApp(deps)).post("/orders").send(VALID_ORDER);
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(deps.createOrder).toHaveBeenCalledWith({
      orderId: GENERATED_ID,
      customer: "Comprador Web",
      email: "buyer@beim.test",
      phone: null,
      ci: null,
      rut: null,
      address: null,
      shipping: null,
      comments: null,
      items: [{ productId: PRODUCT_ID, quantity: 1 }],
      userId: USER_ID
    });
  });

  it("passes an explicit edge orderId through untouched", async () => {
    const deps = okDeps();
    const res = await request(buildApp(deps)).post("/orders").send({ ...VALID_ORDER, orderId: ORDER_ID });
    expect(res.status).toBe(201);
    expect(deps.createOrder).toHaveBeenCalledWith(expect.objectContaining({ orderId: ORDER_ID }));
  });

  it("mints a checkout session with 201 and the legacy envelope", async () => {
    const deps = okDeps();
    const res = await request(buildApp(deps)).post("/checkout-sessions").send(VALID_CHECKOUT);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      ok: true,
      data: {
        id: SESSION_ID,
        url: `${BASE_URL}/checkout/${SESSION_ID}`,
        status: "pending",
        orderId: VENTA_ID,
        expiresAt: EXPIRES_AT.toISOString()
      }
    });
    expect(deps.mintCheckoutSession).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      paymentMethodId: "transferencia-bancaria",
      userId: USER_ID
    });
  });

  it("fails closed with 404 on orders when no identity is wired", async () => {
    const deps = okDeps();
    const res = await request(buildApp(deps, null)).post("/orders").send(VALID_ORDER);
    expect(res.status).toBe(404);
    expect(deps.createOrder).not.toHaveBeenCalled();
  });

  it("rejects unknown body keys with 422 before any handler runs", async () => {
    const deps = okDeps();
    const res = await request(buildApp(deps))
      .post("/orders")
      .send({ ...VALID_ORDER, unknown: "x" });
    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "VALIDATION_ERROR" })
    });
    expect(deps.createOrder).not.toHaveBeenCalled();
  });

  it("rejects non-uuid ids with 422 before any handler runs", async () => {
    const deps = okDeps();
    const res = await request(buildApp(deps))
      .post("/orders")
      .send({ customer: "X", items: [{ productId: "not-a-uuid", quantity: 1 }] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(deps.createOrder).not.toHaveBeenCalled();
  });

  it("rejects an empty items array with 422", async () => {
    const deps = okDeps();
    const res = await request(buildApp(deps)).post("/orders").send({ customer: "X", items: [] });
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
