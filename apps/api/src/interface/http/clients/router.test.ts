import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { makeClientRouter } from "./router.js";

const CLIENT_ID = "123e4567-e89b-12d3-a456-426614174000";

function buildApp(handlers: Parameters<typeof makeClientRouter>[0]): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());
  app.use("/clients", makeClientRouter(handlers));
  return app;
}

function stubHandlers() {
  return {
    list: vi.fn(async (filter: unknown) => ({ items: [], total: 0, filter })),
    getById: vi.fn(async (id: unknown): Promise<unknown> => ({ id })),
    create: vi.fn(async (input: unknown) => ({ created: true, input })),
    update: vi.fn(async (input: unknown) => ({ updated: true, input }))
  };
}

const createBody = { name: "Cliente Uno", email: "uno@test.uy", phone: "099111222" };

describe("client thin router (validate -> handler -> envelope)", () => {
  it("lists through the handler with the parsed query and 200 envelope", async () => {
    const handlers = stubHandlers();
    const res = await request(buildApp(handlers)).get("/clients").query({ active: "all", page: "2" });
    expect(res.status).toBe(200);
    expect(handlers.list).toHaveBeenCalledWith({ active: "all", page: 2 });
    expect(res.body.ok).toBe(true);
  });

  it("rejects unknown query keys with 422 without touching the handler", async () => {
    const handlers = stubHandlers();
    const res = await request(buildApp(handlers)).get("/clients").query({ hacked: "1" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(handlers.list).not.toHaveBeenCalled();
  });

  it("returns the client for a known id with 200 envelope", async () => {
    const handlers = stubHandlers();
    const res = await request(buildApp(handlers)).get(`/clients/${CLIENT_ID}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, data: { id: CLIENT_ID } });
    expect(handlers.getById).toHaveBeenCalledWith(CLIENT_ID);
  });

  it("renders unknown ids as the frozen 404 envelope", async () => {
    const handlers = stubHandlers();
    handlers.getById.mockResolvedValueOnce(null);
    const res = await request(buildApp(handlers)).get(`/clients/${CLIENT_ID}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      ok: false,
      error: { code: "NOT_FOUND_OR_FORBIDDEN", message: `Cliente no encontrado: ${CLIENT_ID}` }
    });
  });

  it("creates with 201 and passes the parsed body to the handler", async () => {
    const handlers = stubHandlers();
    const res = await request(buildApp(handlers)).post("/clients").send(createBody);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true, data: { created: true, input: createBody } });
    expect(handlers.create).toHaveBeenCalledWith(createBody);
  });

  it("rejects unknown body keys with 422 without touching the handler", async () => {
    const handlers = stubHandlers();
    const res = await request(buildApp(handlers)).post("/clients").send({ ...createBody, hacked: 1 });
    expect(res.status).toBe(422);
    expect(handlers.create).not.toHaveBeenCalled();
  });

  it("updates through the handler with id plus patch and 200 envelope", async () => {
    const handlers = stubHandlers();
    const patch = { name: "Cliente Dos", active: false };
    const res = await request(buildApp(handlers)).put(`/clients/${CLIENT_ID}`).send(patch);
    expect(res.status).toBe(200);
    expect(handlers.update).toHaveBeenCalledWith(CLIENT_ID, patch);
  });

  it("rejects non-uuid ids with the frozen 422 envelope", async () => {
    const handlers = stubHandlers();
    const res = await request(buildApp(handlers)).get("/clients/not-a-uuid");
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(handlers.getById).not.toHaveBeenCalled();
  });
});
