import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { errorHandler } from "./error-handler.js";
import { validate } from "./validate.js";

const bodySchema = z.object({
  name: z.string().min(2),
  quantity: z.number().int().positive().default(1)
});

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1)
});

const paramSchema = z.object({
  id: z.string().uuid()
});

function buildApp() {
  const app = express();
  app.use(express.json());

  app.post(
    "/test",
    validate(bodySchema, "body"),
    (req, res) => {
      res.status(200).json({ ok: true, data: req.body });
    }
  );

  app.get(
    "/query",
    validate(querySchema, "query"),
    (req, res) => {
      res.status(200).json({ ok: true, data: req.query });
    }
  );

  app.get(
    "/params/:id",
    validate(paramSchema, "params"),
    (req, res) => {
      res.status(200).json({ ok: true, data: req.params });
    }
  );

  app.use(errorHandler);
  return app;
}

describe("validate middleware", () => {
  it("passes a valid body through and writes the parsed value back", async () => {
    const res = await request(buildApp())
      .post("/test")
      .send({ name: "Ana", quantity: 2 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, data: { name: "Ana", quantity: 2 } });
  });

  it("applies schema defaults to the parsed body", async () => {
    const res = await request(buildApp()).post("/test").send({ name: "Ana" });

    expect(res.status).toBe(200);
    expect(res.body.data.quantity).toBe(1);
  });

  it("rejects an invalid body with 422 and field-level details", async () => {
    const res = await request(buildApp()).post("/test").send({ name: "A" });

    expect(res.status).toBe(422);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.message).toBe("Datos de entrada inválidos");
    expect(res.body.error.details[0].path).toBe("name");
  });

  it("rejects a wrong-typed field with 422 and its path in details", async () => {
    const res = await request(buildApp()).post("/test").send({ name: "Ana", quantity: "mucho" });

    expect(res.status).toBe(422);
    expect(res.body.error.details[0].path).toBe("quantity");
  });

  it("coerces a valid query param and writes the parsed query back", async () => {
    const res = await request(buildApp()).get("/query?page=2");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, data: { page: 2 } });
  });

  it("rejects an invalid query param with 422", async () => {
    const res = await request(buildApp()).get("/query?page=abc");

    expect(res.status).toBe(422);
    expect(res.body.error.details[0].path).toBe("page");
  });

  it("validates params and rejects a malformed uuid with 422", async () => {
    const res = await request(buildApp()).get("/params/not-a-uuid");

    expect(res.status).toBe(422);
    expect(res.body.error.details[0].path).toBe("id");
  });

  it("accepts a valid uuid param", async () => {
    const res = await request(buildApp()).get("/params/4d6a1a6f-1c2b-4f3e-9a8b-2c3d4e5f6a7b");

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe("4d6a1a6f-1c2b-4f3e-9a8b-2c3d4e5f6a7b");
  });
});