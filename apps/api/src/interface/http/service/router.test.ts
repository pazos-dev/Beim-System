import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { NotFoundError } from "../../../errors/taxonomy.js";
import { makeServiceRouter } from "./router.js";

const SERVICE_ID = "123e4567-e89b-12d3-a456-426614174000";

function buildApp(handlers: Parameters<typeof makeServiceRouter>[0]): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());
  app.use("/services", makeServiceRouter(handlers));
  return app;
}

function stubHandlers() {
  return {
    create: vi.fn(async (input: unknown) => ({ created: true, input })),
    rename: vi.fn(async (input: unknown) => ({ renamed: true, input })),
    reprice: vi.fn(async (input: unknown) => ({ repriced: true, input })),
    update: vi.fn(async (input: unknown) => ({ updated: true, input })),
    activate: vi.fn(async (input: unknown) => ({ activated: true, input })),
    deactivate: vi.fn(async (input: unknown) => ({ deactivated: true, input }))
  };
}

const createBody = { id: SERVICE_ID, name: "Service oficial", priceAmount: 2500, priceCurrency: "UYU" };

describe("service thin router (validate -> handler -> envelope)", () => {
  it("creates with 201 and passes the parsed body to the handler", async () => {
    const handlers = stubHandlers();
    const res = await request(buildApp(handlers)).post("/services").send(createBody);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true, data: { created: true, input: createBody } });
    expect(handlers.create).toHaveBeenCalledWith(createBody);
  });

  it("rejects non-uuid service ids with the frozen 422 envelope", async () => {
    const handlers = stubHandlers();
    const res = await request(buildApp(handlers)).post("/services").send({ ...createBody, id: "no-uuid" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(handlers.create).not.toHaveBeenCalled();
  });

  it("rejects unknown body keys with 422 without touching the handler", async () => {
    const handlers = stubHandlers();
    const res = await request(buildApp(handlers)).post("/services").send({ ...createBody, hacked: 1 });
    expect(res.status).toBe(422);
    expect(handlers.create).not.toHaveBeenCalled();
  });

  it("reprices through the handler with the path id and 200 envelope", async () => {
    const handlers = stubHandlers();
    const res = await request(buildApp(handlers)).patch(`/services/${SERVICE_ID}/reprice`).send({ amount: 3000 });
    expect(res.status).toBe(200);
    expect(handlers.reprice).toHaveBeenCalledWith({ serviceId: SERVICE_ID, amount: 3000 });
  });

  it("updates through the handler with patch merge semantics", async () => {
    const handlers = stubHandlers();
    const patch = { name: "Service premium", active: false };
    const res = await request(buildApp(handlers)).put(`/services/${SERVICE_ID}`).send(patch);
    expect(res.status).toBe(200);
    expect(handlers.update).toHaveBeenCalledWith({ serviceId: SERVICE_ID, patch });
  });

  it("renders handler NotFoundError as the frozen 404 envelope", async () => {
    const handlers = stubHandlers();
    handlers.rename.mockRejectedValueOnce(new NotFoundError(`Servicio no encontrado: ${SERVICE_ID}`));
    const res = await request(buildApp(handlers)).patch(`/services/${SERVICE_ID}/rename`).send({ name: "X" });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      ok: false,
      error: { code: "NOT_FOUND_OR_FORBIDDEN", message: `Servicio no encontrado: ${SERVICE_ID}` }
    });
  });
});
