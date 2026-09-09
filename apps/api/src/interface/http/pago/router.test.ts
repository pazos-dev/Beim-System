import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { NotFoundError } from "../../../errors/taxonomy.js";
import type { Identity } from "../edge/auth.js";
import type { PagoRouterDeps } from "./router.js";
import { createPagoRouter } from "./router.js";

const CLIENT: Identity = { userId: "44444444-4444-4444-8444-444444444444", roles: ["cliente"] };
const ORDER_ID = "order-legacy-001";

function baseFakes(): PagoRouterDeps {
  return {
    createPreference: vi.fn(async (input: unknown) => ({ preferenceId: "pref-1", initPoint: "https://mp/pref-1", ...(input as Record<string, unknown>) })),
    handleWebhook: vi.fn(async () => ({ outcome: "paid", orderId: ORDER_ID }))
  };
}

function testApp(overrides: Partial<PagoRouterDeps> = {}, identity: Identity | null = CLIENT): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());
  app.use((req, _res, next) => {
    if (identity !== null) req.identity = identity;
    next();
  });
  app.use("/api/v1", createPagoRouter({ ...baseFakes(), ...overrides }));
  return app;
}

const WEBHOOK_BODY = { id: "evt-1", type: "payment", data: { id: "pay-1" } };

describe("pago thin router (validate -> handler -> envelope)", () => {
  it("mints preferences with 201 for lax legacy order ids", async () => {
    const fakes = baseFakes();
    const res = await request(testApp(fakes)).post(`/api/v1/orders/${ORDER_ID}/payment-preference`);
    expect(res.status).toBe(201);
    expect(fakes.createPreference).toHaveBeenCalledWith({ userId: CLIENT.userId, orderId: ORDER_ID });
    expect(res.body.ok).toBe(true);
  });

  it("answers 401 without identity and never touches the handler", async () => {
    const fakes = baseFakes();
    const res = await request(testApp(fakes, null)).post(`/api/v1/orders/${ORDER_ID}/payment-preference`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTHENTICATION_REQUIRED");
    expect(fakes.createPreference).not.toHaveBeenCalled();
  });

  it("renders handler NotFoundError as the frozen 404 envelope", async () => {
    const res = await request(
      testApp({ createPreference: vi.fn(async () => { throw new NotFoundError(`Orden no encontrada: ${ORDER_ID}`); }) })
    ).post(`/api/v1/orders/${ORDER_ID}/payment-preference`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND_OR_FORBIDDEN");
  });

  it("ingests webhooks with 200 including the order id", async () => {
    const fakes = baseFakes();
    const res = await request(testApp(fakes))
      .post("/api/v1/webhooks/mercadopago")
      .set("x-signature", "sig-1")
      .send(WEBHOOK_BODY);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, data: { status: "paid", orderId: ORDER_ID } });
    expect(fakes.handleWebhook).toHaveBeenCalledWith({
      notificationId: "evt-1",
      type: "payment",
      dataId: "pay-1",
      xSignature: "sig-1",
      xRequestId: undefined
    });
  });

  it("omits orderId when the handler reports none", async () => {
    const res = await request(testApp({ handleWebhook: vi.fn(async () => ({ outcome: "ignored" })) }))
      .post("/api/v1/webhooks/mercadopago")
      .set("x-signature", "sig-1")
      .send(WEBHOOK_BODY);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, data: { status: "ignored" } });
  });

  it("rejects unsigned webhooks with 403 before the handler", async () => {
    const fakes = baseFakes();
    const res = await request(testApp(fakes)).post("/api/v1/webhooks/mercadopago").send(WEBHOOK_BODY);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(fakes.handleWebhook).not.toHaveBeenCalled();
  });

  it("rejects malformed webhook bodies with 422", async () => {
    const fakes = baseFakes();
    const res = await request(testApp(fakes))
      .post("/api/v1/webhooks/mercadopago")
      .set("x-signature", "sig-1")
      .send({ type: "payment" });
    expect(res.status).toBe(422);
    expect(fakes.handleWebhook).not.toHaveBeenCalled();
  });

  it("accepts provider-shaped ids (numbers, extra keys) without 422", async () => {
    const fakes = baseFakes();
    const res = await request(testApp(fakes))
      .post("/api/v1/webhooks/mercadopago")
      .set("x-signature", "sig-1")
      .send({ id: 123, type: "payment", live_mode: true, extra: "x", data: { id: 456, more: 1 } });
    expect(res.status).toBe(200);
    expect(fakes.handleWebhook).toHaveBeenCalledWith({
      notificationId: "123",
      type: "payment",
      dataId: "456",
      xSignature: "sig-1",
      xRequestId: undefined
    });
  });
});
