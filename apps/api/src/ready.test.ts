/**
 * Readiness (`GET /ready`) tests.
 *
 * Unit section is DB-free: `src/db/health.ts` has no imports, so stubbing
 * `runQuery` never touches the pool. The integration section follows the
 * `gestion-api.test.ts` pattern (`describePg` + `setupTestDatabase()` +
 * dynamic imports after `DATABASE_URL` is set).
 *
 * The 503 path is covered by construction: the route is
 * `if (!up) throw new DependencyUnavailableError()` wired to the central
 * error handler (503) — no scenario tears down Postgres to prove it.
 */
import request from "supertest";
import { describe, expect, it } from "vitest";
import { checkDatabase } from "./db/health.js";
import { describePg, setupTestDatabase } from "./db/testDb.js";

setupTestDatabase();

// Dynamic import AFTER setupTestDatabase() set DATABASE_URL at module top:
// createApp pulls in the routers → config/db, which builds the shared Pool
// from DATABASE_URL at module evaluation time.
const { createApp } = await import("./app.js");

describe("checkDatabase", () => {
  it("returns true when the probe query resolves", async () => {
    await expect(checkDatabase(async () => ({ rows: [{ "?column?": 1 }] }))).resolves.toBe(true);
  });

  it("returns false when the probe query rejects", async () => {
    await expect(
      checkDatabase(async () => {
        throw new Error("connection refused");
      })
    ).resolves.toBe(false);
  });

  it("returns false when runQuery throws synchronously", async () => {
    await expect(
      checkDatabase(() => {
        throw new Error("sync boom");
      })
    ).resolves.toBe(false);
  });

  it("returns false after a short timeout when the query never settles", async () => {
    const started = Date.now();
    const up = await checkDatabase(() => new Promise<unknown>(() => {}), 30);
    // Proves the timeout fired (fast, no 2s wait) and the cleared timer
    // leaves the event loop clean for the tests that follow.
    expect(up).toBe(false);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("returns false on timeout without surfacing the late rejection", async () => {
    // Rejects 100ms after the 30ms timeout already won: the rejection branch
    // converts it to `false`, so vitest sees no unhandled rejection.
    const up = await checkDatabase(
      () => new Promise<unknown>((_, reject) => setTimeout(() => reject(new Error("late")), 100)),
      30
    );
    expect(up).toBe(false);
  });
});

describePg("GET /ready", () => {
  it("returns 200 with db up when Postgres answers", async () => {
    const res = await request(createApp()).get("/ready");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, data: { db: "up" } });
  });
});
