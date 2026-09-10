import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { ConflictError, ValidationError } from "../../../errors/taxonomy.js";
import type { Identity } from "../edge/auth.js";
import type { OrdersReadRouterDeps } from "./router.js";
import { createOrdersReadRouter } from "./router.js";

const USER: Identity = { userId: "user-1", roles: ["cliente"] };
const ORDER_ID = "123e4567-e89b-12d3-a456-426614174000";

function baseFakes(): OrdersReadRouterDeps {
  return {
    listMine: vi.fn(async (_userId: string, query: unknown) => ({ query })),
    getMine: vi.fn(async (_userId: string, id: string) => ({ id })),
    cancel: vi.fn(async (_userId: string, id: string) => ({ order: { id } }))
  };
}

function testApp(fakes: OrdersReadRouterDeps, identity: Identity | null = USER): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());
  app.use((req, _res, next) => {
    if (identity !== null) req.identity = identity;
    next();
  });
  app.use("/api/v1", createOrdersReadRouter(fakes));
  return app;
}

describe("orders-read thin router (validate -> handler -> envelope)", () => {
  it("lists owned orders with 200 forwarding userId and the parsed query", async () => {
    const fakes = baseFakes();
    const res = await request(testApp(fakes)).get("/api/v1/orders?page=2&limit=10");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, data: { query: { page: 2, limit: 10 } } });
    expect(fakes.listMine).toHaveBeenCalledWith(USER.userId, { page: 2, limit: 10 });
  });

  it("fail-closed: lists without identity answer 404 without touching handlers", async () => {
    const fakes = baseFakes();
    const res = await request(testApp(fakes, null)).get("/api/v1/orders");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND_OR_FORBIDDEN");
    expect(fakes.listMine).not.toHaveBeenCalled();
  });

  it("rejects unknown query keys and over-limit pages with 422 without touching handlers", async () => {
    const fakes = baseFakes();
    const unknown = await request(testApp(fakes)).get("/api/v1/orders?hacked=1");
    expect(unknown.status).toBe(422);
    expect(unknown.body.error.code).toBe("VALIDATION_ERROR");
    const over = await request(testApp(fakes)).get("/api/v1/orders?limit=500");
    expect(over.status).toBe(422);
    expect(fakes.listMine).not.toHaveBeenCalled();
  });

  it("returns the owned order for a known uuid with 200", async () => {
    const res = await request(testApp(baseFakes())).get(`/api/v1/orders/${ORDER_ID}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, data: { id: ORDER_ID } });
  });

  it("renders foreign or missing orders as the frozen 404 envelope", async () => {
    const res = await request(
      testApp({ ...baseFakes(), getMine: vi.fn(async () => null) })
    ).get(`/api/v1/orders/${ORDER_ID}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      ok: false,
      error: { code: "NOT_FOUND_OR_FORBIDDEN", message: `Orden no encontrada: ${ORDER_ID}` }
    });
  });

  it("fail-closed: reads without identity answer 404 without touching handlers", async () => {
    const fakes = baseFakes();
    const res = await request(testApp(fakes, null)).get(`/api/v1/orders/${ORDER_ID}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND_OR_FORBIDDEN");
    expect(fakes.getMine).not.toHaveBeenCalled();
  });

  it("rejects non-uuid ids on the read with the frozen 422 envelope", async () => {
    const fakes = baseFakes();
    const res = await request(testApp(fakes)).get("/api/v1/orders/not-a-uuid");
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(fakes.getMine).not.toHaveBeenCalled();
  });

  it("cancels an owned order with 200 and the {order} envelope (lax TEXT id)", async () => {
    const fakes = baseFakes();
    const res = await request(testApp(fakes)).post("/api/v1/orders/legacy-text-id/cancel");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, data: { order: { id: "legacy-text-id" } } });
    expect(fakes.cancel).toHaveBeenCalledWith(USER.userId, "legacy-text-id");
  });

  it("fail-closed: cancels without identity answer 404 without touching handlers", async () => {
    const fakes = baseFakes();
    const res = await request(testApp(fakes, null)).post(`/api/v1/orders/${ORDER_ID}/cancel`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND_OR_FORBIDDEN");
    expect(fakes.cancel).not.toHaveBeenCalled();
  });

  it("propagates cancel conflicts as 409 without remap", async () => {
    const res = await request(
      testApp({
        ...baseFakes(),
        cancel: vi.fn(async () => {
          throw new ConflictError("La orden ya no se puede cancelar");
        })
      })
    ).post(`/api/v1/orders/${ORDER_ID}/cancel`);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      ok: false,
      error: { code: "CONFLICT", message: "La orden ya no se puede cancelar" }
    });
  });

  it("renders handler ValidationError as the frozen 422 envelope", async () => {
    const res = await request(
      testApp({
        ...baseFakes(),
        listMine: vi.fn(async () => {
          throw new ValidationError("El filtro de órdenes es inválido");
        })
      })
    ).get("/api/v1/orders");
    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "El filtro de órdenes es inválido" }
    });
  });
});
