import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { Identity } from "../edge/auth.js";
import type { UploadRouterDeps } from "./router.js";
import { createUploadRouter } from "./router.js";

const ADMIN: Identity = { userId: "11111111-1111-4111-8111-111111111111", roles: ["administrador"] };
const CLIENTE: Identity = { userId: "22222222-2222-4222-8222-222222222222", roles: ["cliente"] };
const FILENAME = "a1b2c3d4-e5f6-47a7-b8c9-d0e1f2a3b4c5.png";
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

function baseFakes(): UploadRouterDeps {
  return {
    maxUploadBytes: 1024,
    store: vi.fn(async () => ({ url: `/api/v1/uploads/${FILENAME}` })),
    load: vi.fn(async () => ({ bytes: PNG, contentType: "image/png" }))
  };
}

function testApp(overrides: Partial<UploadRouterDeps> = {}, identity: Identity | null = ADMIN): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use((req, _res, next) => {
    if (identity !== null) req.identity = identity;
    next();
  });
  app.use("/api/v1", createUploadRouter({ ...baseFakes(), ...overrides }));
  return app;
}

describe("upload thin router (edge 415/413 -> handler -> envelope)", () => {
  it("stores with 201 and passes contentType, bytes and actor to the handler", async () => {
    const fakes = baseFakes();
    const res = await request(testApp(fakes))
      .post("/api/v1/uploads/product-image")
      .set("Content-Type", "image/png")
      .send(PNG);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true, data: { url: `/api/v1/uploads/${FILENAME}` } });
    expect(fakes.store).toHaveBeenCalledWith({
      contentType: "image/png",
      bytes: PNG,
      actor: { actorUserId: ADMIN.userId, actorRole: "administrador" }
    });
  });

  it("rejects unknown content types with the frozen 415 envelope", async () => {
    const fakes = baseFakes();
    for (const contentType of ["text/plain", "image/svg+xml"]) {
      const res = await request(testApp(fakes))
        .post("/api/v1/uploads/product-image")
        .set("Content-Type", contentType)
        .send(PNG);
      expect(res.status).toBe(415);
      expect(res.body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
    }
    expect(fakes.store).not.toHaveBeenCalled();
  });

  it("rejects a missing content type with 415 without touching the handler", async () => {
    const fakes = baseFakes();
    const res = await request(testApp(fakes)).post("/api/v1/uploads/product-image");
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
    expect(fakes.store).not.toHaveBeenCalled();
  });

  it("enforces the byte cap at the edge with the frozen 413 envelope", async () => {
    const fakes = baseFakes();
    const res = await request(testApp({ ...fakes, maxUploadBytes: 2 }))
      .post("/api/v1/uploads/product-image")
      .set("Content-Type", "image/png")
      .send(PNG);
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
    expect(fakes.store).not.toHaveBeenCalled();
  });

  it("applies the admin gate: no identity 404, cliente role 403", async () => {
    const fakes = baseFakes();
    const anon = await request(testApp(fakes, null))
      .post("/api/v1/uploads/product-image")
      .set("Content-Type", "image/png")
      .send(PNG);
    expect(anon.status).toBe(404);
    const cliente = await request(testApp(fakes, CLIENTE))
      .post("/api/v1/uploads/product-image")
      .set("Content-Type", "image/png")
      .send(PNG);
    expect(cliente.status).toBe(403);
    expect(fakes.store).not.toHaveBeenCalled();
  });

  it("serves stored bytes publicly with content type and nosniff", async () => {
    const res = await request(testApp({}, null)).get(`/api/v1/uploads/${FILENAME}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.body).toEqual(PNG);
  });

  it("maps invalid filenames to the frozen 404 without touching the handler", async () => {
    const fakes = baseFakes();
    const res = await request(testApp(fakes, null)).get("/api/v1/uploads/not-a-uuid.png");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND_OR_FORBIDDEN");
    expect(fakes.load).not.toHaveBeenCalled();
  });

  it("maps missing files to the frozen 404 envelope", async () => {
    const res = await request(testApp({ load: vi.fn(async () => null) }, null)).get(
      `/api/v1/uploads/${FILENAME}`
    );
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND_OR_FORBIDDEN");
  });
});
