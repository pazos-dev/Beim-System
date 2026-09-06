import request from "supertest";
import { describe, expect, it } from "vitest";

// PR 3: createApp now mounts the gestion router, whose module graph imports
// src/config/db.ts — that module requires DATABASE_URL at load time (it
// builds the shared Pool). Point it at the test database: this unit suite
// never issues a query, so no connection is ever opened.
process.env.DATABASE_URL ??= "postgres://beim@127.0.0.1:5432/beim_api_test";

const { createApp } = await import("./app.js");

describe("app assembly", () => {
  it("GET /health returns 200 with the ok envelope", async () => {
    const res = await request(createApp()).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, data: { status: "ok" } });
  });

  it("turns unmatched routes into a NOT_FOUND_OR_FORBIDDEN envelope (404)", async () => {
    const res = await request(createApp()).get("/no-such-route");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      ok: false,
      error: { code: "NOT_FOUND_OR_FORBIDDEN", message: "Recurso no encontrado" }
    });
  });

  it("sets baseline security headers on responses (nosniff, no-referrer, DENY)", async () => {
    const res = await request(createApp()).get("/health");

    expect(res.status).toBe(200);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers["x-frame-options"]).toBe("DENY");
  });
});