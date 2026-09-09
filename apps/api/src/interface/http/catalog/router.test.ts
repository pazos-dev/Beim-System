import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { ValidationError } from "../../../errors/taxonomy.js";
import type { CatalogRouterDeps } from "./router.js";
import { createCatalogRouter } from "./router.js";

const PRODUCT_ID = "123e4567-e89b-12d3-a456-426614174000";

function baseFakes(): CatalogRouterDeps {
  return {
    listPublished: vi.fn(async (query: unknown) => ({ query })),
    getPublishedById: vi.fn(async (id: unknown) => ({ id })),
    listSlides: vi.fn(async () => [{ id: "slide-1" }])
  };
}

function testApp(overrides: Partial<CatalogRouterDeps> = {}): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());
  app.use("/api/v1", createCatalogRouter({ ...baseFakes(), ...overrides }));
  return app;
}

describe("catalog thin router (validate -> handler -> envelope)", () => {
  it("lists published products with 200 forwarding the parsed query", async () => {
    const fakes = baseFakes();
    const res = await request(testApp(fakes)).get("/api/v1/products?page=2&limit=10&search=taladro");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      data: { query: { page: 2, limit: 10, search: "taladro" } }
    });
    expect(fakes.listPublished).toHaveBeenCalledWith({ page: 2, limit: 10, search: "taladro" });
  });

  it("rejects unknown query keys and over-limit pages with 422 without touching handlers", async () => {
    const fakes = baseFakes();
    const unknown = await request(testApp(fakes)).get("/api/v1/products?hacked=1");
    expect(unknown.status).toBe(422);
    expect(unknown.body.error.code).toBe("VALIDATION_ERROR");
    const over = await request(testApp(fakes)).get("/api/v1/products?limit=500");
    expect(over.status).toBe(422);
    expect(fakes.listPublished).not.toHaveBeenCalled();
  });

  it("returns the published product for a known id with 200", async () => {
    const res = await request(testApp()).get(`/api/v1/products/${PRODUCT_ID}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, data: { id: PRODUCT_ID } });
  });

  it("renders unknown ids as the frozen 404 envelope", async () => {
    const res = await request(
      testApp({ getPublishedById: vi.fn(async () => null) })
    ).get(`/api/v1/products/${PRODUCT_ID}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      ok: false,
      error: { code: "NOT_FOUND_OR_FORBIDDEN", message: `Producto no encontrado: ${PRODUCT_ID}` }
    });
  });

  it("rejects non-uuid ids with the frozen 422 envelope", async () => {
    const fakes = baseFakes();
    const res = await request(testApp(fakes)).get("/api/v1/products/not-a-uuid");
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(fakes.getPublishedById).not.toHaveBeenCalled();
  });

  it("lists promo slides with 200", async () => {
    const res = await request(testApp()).get("/api/v1/promo-slides");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, data: [{ id: "slide-1" }] });
  });

  it("renders handler ValidationError as the frozen 422 envelope", async () => {
    const res = await request(
      testApp({
        listPublished: vi.fn(async () => {
          throw new ValidationError("El filtro del catálogo es inválido");
        })
      })
    ).get("/api/v1/products");
    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "El filtro del catálogo es inválido" }
    });
  });
});
