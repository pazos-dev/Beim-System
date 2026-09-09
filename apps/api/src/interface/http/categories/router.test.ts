import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { makeCategoryRouter } from "./router.js";

function buildApp(handlers: Parameters<typeof makeCategoryRouter>[0]): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());
  app.use("/categories", makeCategoryRouter(handlers));
  return app;
}

function stubHandlers() {
  return {
    list: vi.fn(async (filter: unknown) => ({ items: [], filter })),
    getById: vi.fn(async (id: unknown): Promise<unknown> => ({ id })),
    create: vi.fn(async (input: unknown) => ({ created: true, input })),
    update: vi.fn(async (input: unknown) => ({ updated: true, input }))
  };
}

const createBody = { id: "cat-1", name: "Reparaciones", code: "REP" };

describe("category thin router (validate -> handler -> envelope)", () => {
  it("lists through the handler with the parsed active filter and 200 envelope", async () => {
    const handlers = stubHandlers();
    const res = await request(buildApp(handlers)).get("/categories").query({ active: "false" });
    expect(res.status).toBe(200);
    expect(handlers.list).toHaveBeenCalledWith({ active: false });
    expect(res.body.ok).toBe(true);
  });

  it("rejects unknown query keys with 422 without touching the handler", async () => {
    const handlers = stubHandlers();
    const res = await request(buildApp(handlers)).get("/categories").query({ hacked: "1" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(handlers.list).not.toHaveBeenCalled();
  });

  it("returns the category for a text id with 200 envelope", async () => {
    const handlers = stubHandlers();
    const res = await request(buildApp(handlers)).get("/categories/cat-1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, data: { id: "cat-1" } });
    expect(handlers.getById).toHaveBeenCalledWith("cat-1");
  });

  it("renders unknown ids as the frozen 404 envelope", async () => {
    const handlers = stubHandlers();
    handlers.getById.mockResolvedValueOnce(null);
    const res = await request(buildApp(handlers)).get("/categories/missing");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      ok: false,
      error: { code: "NOT_FOUND_OR_FORBIDDEN", message: "Categoría no encontrada: missing" }
    });
  });

  it("creates with 201 and passes the parsed body to the handler", async () => {
    const handlers = stubHandlers();
    const res = await request(buildApp(handlers)).post("/categories").send(createBody);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true, data: { created: true, input: createBody } });
    expect(handlers.create).toHaveBeenCalledWith(createBody);
  });

  it("rejects incomplete bodies with 422 without touching the handler", async () => {
    const handlers = stubHandlers();
    const res = await request(buildApp(handlers)).post("/categories").send({ id: "cat-2", name: "Sin código" });
    expect(res.status).toBe(422);
    expect(handlers.create).not.toHaveBeenCalled();
  });

  it("updates through the handler with text id plus patch and 200 envelope", async () => {
    const handlers = stubHandlers();
    const patch = { name: "Reparaciones plus", active: false };
    const res = await request(buildApp(handlers)).put("/categories/cat-1").send(patch);
    expect(res.status).toBe(200);
    expect(handlers.update).toHaveBeenCalledWith("cat-1", patch);
  });

  it("rejects unknown body keys on update with 422", async () => {
    const handlers = stubHandlers();
    const res = await request(buildApp(handlers)).put("/categories/cat-1").send({ hacked: 1 });
    expect(res.status).toBe(422);
    expect(handlers.update).not.toHaveBeenCalled();
  });
});
