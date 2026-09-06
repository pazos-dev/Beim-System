/**
 * Test-only DB lifecycle helper (PR 3 service + API integration suites).
 *
 * Mirrors the contract.test.ts pattern: runs against TEST_DATABASE_URL
 * (default postgres://beim@127.0.0.1:5432/beim_api_test), refuses any
 * database whose name does not end in `_test`, sets process.env.DATABASE_URL
 * BEFORE any module that builds the shared Pool is imported, creates +
 * migrates the database in beforeAll and drops it in afterAll. The dev
 * database (beim_api) is never touched.
 *
 * Suites using this helper MUST run with file-parallelism disabled (see
 * vitest.config.ts): the drop in afterAll and the create in beforeAll of
 * another suite would otherwise race.
 */
import { Pool } from "pg";
import { afterAll, beforeAll, describe } from "vitest";
import { applyMigrations } from "./migrate.js";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://beim@127.0.0.1:5432/beim_api_test";

const TEST_DB_NAME = new URL(TEST_DATABASE_URL).pathname.replace(/^\//, "");
if (!/_(test|tests)$/.test(TEST_DB_NAME)) {
  throw new Error(
    `TEST_DATABASE_URL must point to a *_test database (got "${TEST_DB_NAME}") — refusing to run against a non-test database.`
  );
}

// Must run before any dynamic import of services/repositories (they build the
// shared Pool from DATABASE_URL at module evaluation time).
process.env.DATABASE_URL = TEST_DATABASE_URL;

// --- Postgres availability probe -------------------------------------------------
// CI runs the integration suites DB-free (no Postgres service). When no server
// is reachable, `describePg` skips every suite that depends on a real database
// instead of failing the pipeline. The full suites still run wherever a server
// is available (local dev, SDD verify). `setupTestDatabase()` becomes a no-op
// in the same situation.
let pgAvailable = false;
try {
  const probe = new Pool({ connectionString: adminUrl(), max: 1, connectionTimeoutMillis: 2_000 });
  await probe.query("SELECT 1");
  await probe.end();
  pgAvailable = true;
} catch {
  pgAvailable = false;
}
export const describePg = pgAvailable ? describe : describe.skip;

// Admin connection to the maintenance database `postgres` for CREATE/DROP.
function adminUrl(): string {
  const url = new URL(TEST_DATABASE_URL);
  url.pathname = "/postgres";
  return url.toString();
}

async function ensureTestDatabase(): Promise<void> {
  const admin = new Pool({ connectionString: adminUrl(), max: 2 });
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${TEST_DB_NAME}"`);
  } finally {
    await admin.end();
  }
}

async function dropTestDatabase(): Promise<void> {
  const admin = new Pool({ connectionString: adminUrl(), max: 2 });
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}" WITH (FORCE)`);
  } finally {
    await admin.end();
  }
}

/** Registers beforeAll (create + migrate) and afterAll (drop) for the suite. */
export function setupTestDatabase(): void {
  if (!pgAvailable) return;

  beforeAll(async () => {
    await ensureTestDatabase();
    await applyMigrations({ connectionString: TEST_DATABASE_URL });
  }, 60_000);

  afterAll(async () => {
    // End the shared Pool BEFORE dropping: DROP ... WITH (FORCE) terminates
    // any remaining connections, which node-pg surfaces as unhandled 'error'
    // events on the clients (contract.test.ts does the same). The dynamic
    // import returns the SAME config/db module instance the services use.
    const { pool } = await import("../config/db.js");
    await pool.end();
    await dropTestDatabase();
  });
}