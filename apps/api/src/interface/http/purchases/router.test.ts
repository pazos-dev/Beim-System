import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { makePurchaseRouter } from "./router.js";

const PURCHASE_ID = "123e4567-e89b-12d3-a456-426614174000";

function buildApp(handlers: Parameters<typeof makePurchaseRouter>[0]): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());
  app.use("/purchases", makePurchaseRouter(handlers));
  return app;
}

function stubHandlers() {
  return {
    list: vi.fn(async (filter: unknown) => ({ items: [], total: 0, filter })),
    getById: vi.fn(async (id: unknown): Promise<unknown> => ({ id })),
    create: vi.fn(async (input: unknown, actor: unknown) => ({ created: true, input, actor })),
    update: vi.fn(async (id: unknown, patch: unknown) => ({ updated: true, id, patch }))
  };
}

const createBody = { supplierName: "Proveedor Uno", data: { note: "contado" } };

describe("purchase thin router (validate -> handler -> envelope)", () => {
  it("lists through the handler with the parsed query and 200 envelope", async () => {
    const handlers = stubHandlers();
    const res = await request(buildApp(handlers)).get("/purchases").query({ active: "all" });
    expect(res.status).toBe(200);
    expect(handlers.list).toHaveBeenCalledWith({ active: "all" });
    expect(res.body.ok).toBe(true);
  });

  it("rejects unknown query keys with 422 without touching the handler", async () => {
    const handlers = stubHandlers();
    const res = await request(buildApp(handlers)).get("/purchases").query({ hacked: "1" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(handlers.list).not.toHaveBeenCalled();
  });

  it("returns the purchase for a known id with 200 envelope", async () => {
    const handlers = stubHandlers();
    const res = await request(buildApp(handlers)).get(`/purchases/${PURCHASE_ID}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, data: { id: PURCHASE_ID } });
    expect(handlers.getById).toHaveBeenCalledWith(PURCHASE_ID);
  });

  it("renders unknown ids as the frozen 404 envelope", async () => {
    const handlers = stubHandlers();
    handlers.getById.mockResolvedValueOnce(null);
    const res = await request(buildApp(handlers)).get(`/purchases/${PURCHASE_ID}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      ok: false,
      error: { code: "NOT_FOUND_OR_FORBIDDEN", message: `Compra no encontrada: ${PURCHASE_ID}` }
    });
  });

  it("creates with 201 and passes the parsed body plus the null audit actor", async () => {
    const handlers = stubHandlers();
    const res = await request(buildApp(handlers)).post("/purchases").send(createBody);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      ok: true,
      data: { created: true, input: createBody, actor: { actorUserId: null, actorRole: null } }
    });
    expect(handlers.create).toHaveBeenCalledWith(createBody, { actorUserId: null, actorRole: null });
  });

  it("rejects unknown body keys with 422 without touching the handler", async () => {
    const handlers = stubHandlers();
    const res = await request(buildApp(handlers)).post("/purchases").send({ ...createBody, hacked: 1 });
    expect(res.status).toBe(422);
    expect(handlers.create).not.toHaveBeenCalled();
  });

  it("updates through the handler with id plus patch and 200 envelope", async () => {
    const handlers = stubHandlers();
    const patch = { supplierName: "Proveedor Dos", active: false };
    const res = await request(buildApp(handlers)).put(`/purchases/${PURCHASE_ID}`).send(patch);
    expect(res.status).toBe(200);
    expect(handlers.update).toHaveBeenCalledWith(PURCHASE_ID, patch);
  });

  it("rejects non-uuid ids with the frozen 422 envelope", async () => {
    const handlers = stubHandlers();
    const res = await request(buildApp(handlers)).get("/purchases/not-a-uuid");
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(handlers.getById).not.toHaveBeenCalled();
  });
});
