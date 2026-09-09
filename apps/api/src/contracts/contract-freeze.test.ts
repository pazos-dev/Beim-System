/**
 * Contract freeze (slice 0.5, change `clean-architecture-backend`).
 *
 * Frozen baselines every future slice must keep green (empty diff):
 *  1. Served OpenAPI contract (GET /openapi.json reduced to route table).
 *  2. Envelope/status matrix (registry + frozen error taxonomy).
 *  3. SQL text baseline (query literals under the scanned roots).
 *
 * First run creates a missing fixture and fails on purpose: review the
 * generated JSON, re-run for green. Any later mismatch means the contract
 * changed — update the fixture deliberately, never loosen the test.
 * DB-free: no query is ever issued (fs reads + supertest only).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Same reason as app.test.ts: createApp builds the shared Pool at import
// time, so point DATABASE_URL at the test database first. No connection is
// ever opened here.
process.env.DATABASE_URL ??= "postgres://beim@127.0.0.1:5432/beim_api_test";

const { createApp } = await import("../app.js");
const { OPENAPI_ROUTES } = await import("../docs/openapi.js");
const { ERROR_CODES, MESSAGE_BY_CODE } = await import("../errors/taxonomy.js");

const HERE = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_DIR = join(HERE, "__snapshots__");
const PACKAGE_ROOT = join(HERE, "..", "..");

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(SNAPSHOT_DIR, name), "utf8"));
}

type Serializer = (actual: unknown) => string;

const pretty: Serializer = (actual) => `${JSON.stringify(actual, null, 2)}\n`;
/** One JSON row per line: route tables stay readable without 13 lines per entry. */
const rows: Serializer = (actual) =>
  `[\n${(actual as unknown[]).map((row) => `  ${JSON.stringify(row)}`).join(",\n")}\n]\n`;

/** Envelope matrix: codes/messages inline, one route per line. */
const envelope: Serializer = (actual) => {
  const matrix = actual as { codes: unknown; messages: unknown; routes: unknown[] };
  const routeLines = matrix.routes.map((route) => `    ${JSON.stringify(route)}`).join(",\n");
  return `{\n  "codes": ${JSON.stringify(matrix.codes)},\n  "messages": ${JSON.stringify(matrix.messages)},\n  "routes": [\n${routeLines}\n  ]\n}\n`;
};

/** Writes the baseline on first run (then fails so the diff gets reviewed). */
function expectFrozen(name: string, actual: unknown, serialize: Serializer = pretty): void {
  const path = join(SNAPSHOT_DIR, name);
  if (!existsSync(path)) {
    mkdirSync(SNAPSHOT_DIR, { recursive: true });
    writeFileSync(path, serialize(actual));
  }
  expect(readFixture(name), `freeze mismatch in ${name}: update the fixture deliberately`).toEqual(actual);
}

interface PathOperation {
  responses?: Record<string, unknown>;
  security?: unknown;
}

function servedRouteTable(document: unknown): unknown[] {
  const paths = (document as { paths?: Record<string, Record<string, PathOperation>> }).paths ?? {};
  const rows = Object.entries(paths).flatMap(([path, operations]) =>
    Object.entries(operations).map(([method, operation]) => ({
      method,
      path,
      statuses: Object.keys(operation.responses ?? {})
        .map(Number)
        .sort((a, b) => a - b),
      secured: operation.security !== undefined
    }))
  );
  return rows.sort((a, b) => `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`));
}

const LITERAL_PATTERN = /`(?:[^`\\]|\\.)*`|"(?:[^"\n\\]|\\.)*"|'(?:[^'\n\\]|\\.)*'/g;
const SQL_KEYWORD =
  /\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|VALUES|JOIN|BEGIN|COMMIT|ROLLBACK|DROP|CREATE|ALTER|TRUNCATE|ORDER\s+BY|GROUP\s+BY)\b/i;

/** Scanned roots: the shim (no SQL of its own) + the 0.4 pool home + prod query sites. File-loaded SQL (schema/seed/migrations/*.sql) is versioned as .sql files, not literals. */
const SQL_ROOTS = [
  "src/config/db.ts",
  "src/composition-root.ts",
  "src/modules/gestion/repositories",
  "src/modules/webshop/repositories",
  "src/db"
];

function collectSourceFiles(root: string): string[] {
  const absolute = join(PACKAGE_ROOT, root);
  const stats = statSync(absolute);
  if (stats.isFile()) return [absolute];
  return readdirSync(absolute)
    .map((entry) => join(absolute, entry))
    .filter((entry) => !entry.endsWith(".test.ts") && !entry.endsWith("testDb.ts"))
    .flatMap((entry) => (statSync(entry).isDirectory() ? collectSourceFiles(relative(PACKAGE_ROOT, entry)) : [entry]))
    .filter((entry) => entry.endsWith(".ts"));
}

function sqlTextsOf(source: string): string[] {
  // Block comments first: doc text in backticks (e.g. `insert`) is not SQL.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const found = new Set<string>();
  for (const literal of code.match(LITERAL_PATTERN) ?? []) {
    if (SQL_KEYWORD.test(literal)) found.add(literal.replace(/\s+/g, " ").trim());
  }
  return [...found].sort();
}

function sqlBaseline(): unknown {
  const files = SQL_ROOTS.flatMap(collectSourceFiles)
    .map((absolute) => ({
      file: relative(PACKAGE_ROOT, absolute).split(sep).join("/"),
      statements: sqlTextsOf(readFileSync(absolute, "utf8"))
    }))
    .filter((entry) => entry.statements.length > 0)
    .sort((a, b) => a.file.localeCompare(b.file));
  return { version: 1, roots: SQL_ROOTS, files };
}

describe("contract freeze (slice 0.5)", () => {
  it("serves the frozen OpenAPI route table at GET /openapi.json", async () => {
    const { default: request } = await import("supertest");
    const res = await request(createApp()).get("/openapi.json");

    expect(res.status).toBe(200);
    const table = servedRouteTable(res.body);
    expect(table.length).toBeGreaterThan(0);
    expectFrozen("openapi-routes.snapshot.json", table, rows);
  });

  it("keeps the envelope/status matrix bound to the frozen taxonomy", () => {
    const routes = [...OPENAPI_ROUTES]
      .map((route) => ({
        method: route.method,
        path: route.path,
        auth: route.auth,
        successStatus: route.successStatus,
        errorCodes: [...route.errorCodes]
      }))
      .sort((a, b) => `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`));
    expect(routes.length).toBeGreaterThan(0);
    expectFrozen(
      "envelope-matrix.snapshot.json",
      {
        codes: { ...ERROR_CODES },
        messages: { ...MESSAGE_BY_CODE },
        routes
      },
      envelope
    );
  });

  it("keeps every production SQL text byte-identical", () => {
    expectFrozen("sql-texts.snapshot.json", sqlBaseline());
  });
});
