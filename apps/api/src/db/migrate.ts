/**
 * Idempotent migration script: applies the vendored legacy schema.sql then
 * seed.sql against a Postgres database.
 *
 * CLI (via `pnpm --filter @beim/api db:migrate`):
 *   - Reads DATABASE_URL (or PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD).
 *   - Honors `MIGRATE_DROP_FIRST=1` to DROP SCHEMA public CASCADE first
 *     (DEV ONLY — wipes every table; never set in production).
 *   - Exit code 0 on success, 1 on failure.
 *
 * Programmatic (contract tests): `applyMigrations({ connectionString })`.
 *
 * The legacy SQL is intentionally NOT edited (vendored verbatim): every DDL
 * statement is wrapped in IF NOT EXISTS and seed rows use ON CONFLICT, so a
 * re-run is a no-op — that is the idempotency contract.
 *
 * After schema + seed, every *.sql file under ./migrations is applied in
 * filename order (PR 4). Migration files own NEW tables/columns only — they
 * never edit the vendored schema (e.g. 0001 adds `published` + session tables).
 */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Pool } from "pg";
import { loadConfig } from "../config/env.js";

const SCHEMA_SQL = fileURLToPath(new URL("./schema.sql", import.meta.url));
const SEED_SQL = fileURLToPath(new URL("./seed.sql", import.meta.url));
const MIGRATIONS_DIR = fileURLToPath(new URL("./migrations", import.meta.url));

export interface MigrateOptions {
  connectionString: string;
  /** DEV ONLY: DROP SCHEMA public CASCADE before applying. */
  dropFirst?: boolean;
}

export async function applyMigrations(options: MigrateOptions): Promise<void> {
  const { connectionString, dropFirst = false } = options;
  const pool = new Pool({ connectionString, max: 1 });

  try {
    if (dropFirst) {
      await pool.query("DROP SCHEMA public CASCADE");
      await pool.query("CREATE SCHEMA public");
    }

    const schemaSql = await readFile(SCHEMA_SQL, "utf8");
    const seedSql = await readFile(SEED_SQL, "utf8");

    // Multi-statement scripts are safe here: no interpolated parameters.
    await pool.query(schemaSql);
    await pool.query(seedSql);

    // Idempotent per-file migrations (0001-webshop-auth-catalog.sql, ...).
    const migrationFiles = (await readdir(MIGRATIONS_DIR))
      .filter((file) => file.endsWith(".sql"))
      .sort();
    for (const file of migrationFiles) {
      const migrationSql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
      await pool.query(migrationSql);
    }
  } finally {
    await pool.end();
  }
}

function isDirectRun(): boolean {
  return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const dropFirst = process.env.MIGRATE_DROP_FIRST === "1";
  if (dropFirst) {
    console.warn(
      "[db:migrate] MIGRATE_DROP_FIRST=1 — DROPPING schema public. Dev-only flag; never use against production."
    );
  }
  console.log(`[db:migrate] applying schema.sql + seed.sql to ${config.database.connectionString}`);
  await applyMigrations({ connectionString: config.database.connectionString, dropFirst });
  console.log("[db:migrate] done");
}

if (isDirectRun()) {
  main().catch((err: unknown) => {
    console.error("[db:migrate] FAILED:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}