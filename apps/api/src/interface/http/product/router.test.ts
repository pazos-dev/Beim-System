import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { NotFoundError } from "../../../errors/taxonomy.js";
import { makeProductRouter } from "./router.js";

const PRODUCT_ID = "prod-legacy-001";

function buildApp(handlers: Parameters<typeof makeProductRouter>[0]): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());
  app.use("/products", makeProductRouter(handlers));
  return app;
}

function stubHandlers() {
  return {
    create: vi.fn(async (input: unknown) => ({ created: true, input })),
    sell: vi.fn(async (input: unknown) => ({ sold: true, input })),
    consumeWorkshop: vi.fn(async (input: unknown) => ({ consumed: true, input })),
    restore: vi.fn(async (input: unknown) => ({ restored: true, input }))
  };
}

const createBody = {
  id: PRODUCT_ID,
  productCode: 7,
  name: "Taladro 12V",
  categoryId: "cat-herramientas",
  priceAmount: 1500,
  priceCurrency: "UYU",
  stock: 10
};

describe("product thin router (validate -> handler -> envelope)", () => {
  it("creates with 201 and passes the parsed body to the handler", async () => {
    const handlers = stubHandlers();
    const res = await request(buildApp(handlers)).post("/products").send(createBody);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true, data: { created: true, input: createBody } });
    expect(handlers.create).toHaveBeenCalledWith(createBody);
  });

  it("rejects unknown body keys with the frozen 422 envelope", async () => {
    const handlers = stubHandlers();
    const res = await request(buildApp(handlers)).post("/products").send({ ...createBody, hacked: 1 });
    expect(res.status).toBe(422);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(handlers.create).not.toHaveBeenCalled();
  });

  it("sells through the handler with the path id and 200 envelope", async () => {
    const handlers = stubHandlers();
    const res = await request(buildApp(handlers)).post(`/products/${PRODUCT_ID}/sell`).send({ qty: 2 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, data: { sold: true, input: { productId: PRODUCT_ID, qty: 2 } } });
  });

  it("rejects non-positive qty with 422 without touching the handler", async () => {
    const handlers = stubHandlers();
    const res = await request(buildApp(handlers)).post(`/products/${PRODUCT_ID}/sell`).send({ qty: 0 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(handlers.sell).not.toHaveBeenCalled();
  });

  it("restores lots through the handler with the 200 envelope", async () => {
    const handlers = stubHandlers();
    const body = { allocations: [{ lotId: "lot-1", qty: 3 }] };
    const res = await request(buildApp(handlers)).post(`/products/${PRODUCT_ID}/restore`).send(body);
    expect(res.status).toBe(200);
    expect(handlers.restore).toHaveBeenCalledWith({ productId: PRODUCT_ID, ...body });
  });

  it("renders handler NotFoundError as the frozen 404 envelope", async () => {
    const handlers = stubHandlers();
    handlers.sell.mockRejectedValueOnce(new NotFoundError(`Producto no encontrado: ${PRODUCT_ID}`));
    const res = await request(buildApp(handlers)).post(`/products/${PRODUCT_ID}/sell`).send({ qty: 1 });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      ok: false,
      error: { code: "NOT_FOUND_OR_FORBIDDEN", message: `Producto no encontrado: ${PRODUCT_ID}` }
    });
  });
});
