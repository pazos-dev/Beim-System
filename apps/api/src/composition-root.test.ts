import request from "supertest";
import { describe, expect, it } from "vitest";

// Same DB-free convention as src/app.test.ts: the composition root builds
// the shared Pool at import time (preserved side-effect), so point it at the
// test database. This suite never issues a query, no connection is opened.
process.env.DATABASE_URL ??= "postgres://beim@127.0.0.1:5432/beim_api_test";

const root = await import("./composition-root.js");
const appShim = await import("./app.js");
const dbShim = await import("./config/db.js");
const { ConflictError } = await import("./errors/taxonomy.js");
const { PgUnitOfWork } = await import("./application/shared/unit-of-work.js");

describe("composition root", () => {
  it("boots the app and answers /health with the ok envelope", async () => {
    const res = await request(root.createApp()).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, data: { status: "ok" } });
  });

  it("keeps a single app factory (app.ts is a shim, no logic duplication)", () => {
    expect(appShim.createApp).toBe(root.createApp);
  });

  it("keeps a single shared pool/query (config/db.ts is a shim)", () => {
    expect(dbShim.pool).toBe(root.pool);
    expect(dbShim.query).toBe(root.query);
  });

  it("wires the new building blocks (Types, toAppError, UnitOfWork)", () => {
    // Types (0.1) reachable from the root.
    expect(root.createMoney(10, "UYU")).toEqual({ amount: 10, currency: "UYU" });
    // Error map (0.2) reachable from the root.
    expect(root.toAppError({ code: "23505" })).toBeInstanceOf(ConflictError);
    // UnitOfWork (0.3): factory injects the shared pool by default.
    expect(root.createUnitOfWork()).toBeInstanceOf(PgUnitOfWork);
    expect(typeof root.unitOfWork.run).toBe("function");
  });
});
