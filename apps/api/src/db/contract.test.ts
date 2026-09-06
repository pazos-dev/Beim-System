/**
 * Contract tests against REAL Postgres (task 3.5).
 *
 * Runs by default against the dedicated test database pointed to by
 * `TEST_DATABASE_URL` (default `postgres://beim@127.0.0.1:5432/beim_api_test`).
 * The database is created, migrated and dropped inside this file — the dev
 * database (`beim_api`) is never touched. A name guard refuses to run against
 * any database whose name does not end in `_test`.
 *
 * Suites:
 *   A  guardDecrement concurrency  — exactly one success, one 409
 *   B  annul restore               — stock returns to original value
 *   C  financial-state singleton   — singleton_id=1, latest upsert wins, jsonb passthrough
 *   D  receipts insert             — jsonb payload passthrough, nextNumber, markAnnuled
 *   E  orders insert + catalog     — unpaid defaults, item rows, pagination
 */
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InsufficientStockError } from "../errors/taxonomy.js";

// Env must be set BEFORE the dynamic imports below: the repositories transitively
// import src/config/db.ts, which builds the shared Pool from DATABASE_URL at
// module evaluation time (ESM import hoisting would otherwise run first).
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://beim@127.0.0.1:5432/beim_api_test";

const TEST_DB_NAME = new URL(TEST_DATABASE_URL).pathname.replace(/^\//, "");
if (!/_(test|tests)$/.test(TEST_DB_NAME)) {
  throw new Error(
    `TEST_DATABASE_URL must point to a *_test database (got "${TEST_DB_NAME}") — refusing to run contract tests against a non-test database.`
  );
}
process.env.DATABASE_URL = TEST_DATABASE_URL;

// Admin connection to the maintenance database `postgres` for CREATE/DROP.
function adminUrl(): string {
  const url = new URL(TEST_DATABASE_URL);
  url.pathname = "/postgres";
  return url.toString();
}

async function ensureTestDatabase(): Promise<void> {
  const admin = new Pool({ connectionString: adminUrl(), max: 2 });
  try {
    const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [TEST_DB_NAME]);
    if (existing.rowCount) {
      // Fresh deterministic state for every run: drop first.
      await admin.query(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}" WITH (FORCE)`);
    }
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

// --- Postgres availability probe -------------------------------------------------
// CI runs this suite DB-free (no Postgres service). When no server is reachable the
// contract suites are skipped as a unit instead of failing the pipeline; the full
// suite still runs wherever a real server is available (local dev, SDD verify).
let pgAvailable = false;
try {
  const probe = new Pool({
    connectionString: adminUrl(),
    max: 1,
    connectionTimeoutMillis: 2_000
  });
  await probe.query("SELECT 1");
  await probe.end();
  pgAvailable = true;
} catch {
  pgAvailable = false;
}
const describePg = pgAvailable ? describe : describe.skip;

// Dynamic imports so the env assignment above wins.
const { pool } = await import("../config/db.js");
const { applyMigrations } = await import("./migrate.js");
const { stockRepository } = await import("../modules/gestion/repositories/pg-stock.js");
const { financialStateRepository } = await import(
  "../modules/gestion/repositories/pg-financial-state.js"
);
const { receiptsRepository } = await import("../modules/gestion/repositories/pg-receipts.js");
const { ordersRepository, catalogRepository } = await import(
  "../modules/webshop/repositories/pg-orders.js"
);
const { withTransaction } = await import("./withTransaction.js");

let db: Pool;

beforeAll(async () => {
  if (!pgAvailable) return;
  await ensureTestDatabase();
  await applyMigrations({ connectionString: TEST_DATABASE_URL });
  db = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
}, 60_000);

afterAll(async () => {
  if (!pgAvailable) return;
  // Close EVERY pool holding connections to the test database before dropping
  // it (DROP ... WITH (FORCE) would otherwise terminate them mid-flight).
  await db?.end();
  await pool.end();
  await dropTestDatabase();
});

/** Resets a product row to a known stock and returns its id. */
async function seedProduct(id: string, stock: number): Promise<string> {
  await db.query(
    `INSERT INTO products (id, name, category_id, brand, model, price, currency, stock, badge, description)
     VALUES ($1, 'Contract seed', 'celulares', '', '', 0, 'UYU', $2, 'Nuevo', '')
     ON CONFLICT (id) DO UPDATE SET stock = EXCLUDED.stock, updated_at = now()`,
    [id, stock]
  );
  return id;
}

async function readStock(id: string): Promise<number> {
  const { rows } = await db.query<{ stock: number }>("SELECT stock FROM products WHERE id = $1", [id]);
  return rows[0].stock;
}

describePg("migrations", () => {
  it("is idempotent: re-applying schema + seed + migrations keeps 21 tables and does not duplicate seed rows", async () => {
    // First apply happened in beforeAll; this is the second full re-apply.
    await applyMigrations({ connectionString: TEST_DATABASE_URL });

    // 19 vendored schema tables + 2 migration tables (webshop_sessions,
    // checkout_sessions from 0001-webshop-auth-catalog.sql).
    const tables = await db.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
    );
    expect(tables.rows[0].count).toBe("21");

    const categories = await db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM categories"
    );
    expect(categories.rows[0].count).toBe(7);

    const users = await db.query<{ count: number }>("SELECT count(*)::int AS count FROM users");
    expect(users.rows[0].count).toBe(3);

    const admin = await db.query<{ role: string }>(
      "SELECT role FROM users WHERE username = 'admin'"
    );
    expect(admin.rows[0].role).toBe("admin");
  });
});

describePg("Suite A — guardDecrement concurrency (spec: Concurrent decrement safe)", () => {
  it("two parallel qty=1 decrements on stock=1: exactly one success, one 409 with currentStock=0", async () => {
    const productId = await seedProduct("contract-a-1", 1);

    const results = await Promise.allSettled([
      stockRepository.guardDecrement(productId, 1),
      stockRepository.guardDecrement(productId, 1)
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    if (fulfilled[0].status !== "fulfilled" || rejected[0].status !== "rejected") {
      throw new Error("unreachable");
    }
    if (rejected[0].reason instanceof InsufficientStockError) {
      expect(rejected[0].reason.status).toBe(409);
      expect(rejected[0].reason.details).toEqual({ currentStock: 0 });
    } else {
      throw new Error(`expected InsufficientStockError, got ${String(rejected[0].reason)}`);
    }
    expect(fulfilled[0].value).toEqual({ currentStock: 0 });
    expect(await readStock(productId)).toBe(0);
  });

  it("qty above stock rejects with 409 and reports the current stock", async () => {
    const productId = await seedProduct("contract-a-2", 3);

    await expect(stockRepository.guardDecrement(productId, 5)).rejects.toMatchObject({
      name: "AppError",
      status: 409,
      code: "INSUFFICIENT_STOCK",
      details: { currentStock: 3 }
    });
    expect(await readStock(productId)).toBe(3);
  });

  it("decrementing a missing product rejects with 404", async () => {
    await expect(stockRepository.guardDecrement("contract-missing-product", 1)).rejects.toMatchObject({
      status: 404
    });
  });
});

describePg("Suite B — annul restore (spec: Annul restores stock)", () => {
  it("restore returns the stock to its original value", async () => {
    const productId = await seedProduct("contract-b-1", 5);

    const after = await stockRepository.guardDecrement(productId, 2);
    expect(after.currentStock).toBe(3);

    await stockRepository.restore(productId, 2);
    expect(await readStock(productId)).toBe(5);
  });

  it("restoring a missing product rejects with 404", async () => {
    await expect(stockRepository.restore("contract-missing-product", 1)).rejects.toMatchObject({ status: 404 });
  });
});

describePg("Suite C — financial-state singleton (spec: Singleton upsert)", () => {
  it("keeps a single singleton_id=1 row and the latest upsert wins, preserving unknown jsonb keys", async () => {
    const first = await financialStateRepository.upsertSingleton({
      capitalInitial: 1000,
      expenses: [{ name: "Alquiler", amount: 200 }],
      menuItems: [{ label: "Ventas" }],
      accountingState: { period: "2026-08" },
      preferences: { theme: "dark", customFlag: true, deep: { keep: [1, 2, 3] } }
    });
    expect(first.singletonId).toBe(1);
    expect(first.capitalInitial).toBe(1000);

    const latest = await financialStateRepository.upsertSingleton({
      capitalInitial: 2500,
      expenses: [],
      menuItems: [],
      accountingState: { period: "2026-09" },
      preferences: { theme: "light", extraUnknown: "kept-through-passthrough" }
    });
    expect(latest.singletonId).toBe(1);
    expect(latest.capitalInitial).toBe(2500);

    const read = await financialStateRepository.getSingleton();
    expect(read).not.toBeNull();
    if (read === null) throw new Error("unreachable");
    expect(read.singletonId).toBe(1);
    expect(read.capitalInitial).toBe(2500);
    expect(read.preferences).toEqual({ theme: "light", extraUnknown: "kept-through-passthrough" });

    const { rows } = await db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM gestion_financial_state WHERE singleton_id = 1"
    );
    expect(rows[0].n).toBe("1");

    // Raw jsonb readback proves the unknown key survived the round trip unmodified.
    const raw = await db.query<{ preferences: unknown }>(
      "SELECT preferences FROM gestion_financial_state WHERE singleton_id = 1"
    );
    expect(raw.rows[0].preferences).toEqual({ theme: "light", extraUnknown: "kept-through-passthrough" });
  });

  it("getSingleton returns null when no row exists", async () => {
    await db.query("DELETE FROM gestion_financial_state");
    const read = await financialStateRepository.getSingleton();
    expect(read).toBeNull();
  });
});

describePg("Suite D — receipts insert + jsonb passthrough (spec: JSONB backward compatibility)", () => {
  it("inserts a receipt, preserves unknown payload keys, and previews the next number", async () => {
    const payload = {
      legacyField: "valor-antiguo",
      nested: { keep: [1, 2, 3] },
      booleanFlag: true,
      nullValue: null
    };

    const receipt = await receiptsRepository.insertReceipt({
      clientName: "Cliente Contract",
      clientId: "5.123.456-7",
      clientPhone: "099000000",
      deviceBrand: "Samsung",
      deviceModel: "Galaxy S23",
      reportedIssue: "Pantalla rota",
      services: ["reparacion", "diagnostico"],
      price: "3500",
      payload
    });

    expect(receipt.receiptNumber).toBeGreaterThanOrEqual(1000);
    expect(receipt.id).toBeTruthy();
    expect(receipt.clientName).toBe("Cliente Contract");
    expect(receipt.services).toEqual(["reparacion", "diagnostico"]);
    expect(receipt.payload).toEqual(payload);
    expect(await receiptsRepository.nextNumber()).toBe(receipt.receiptNumber + 1);

    // Raw jsonb readback: unknown keys preserved byte-for-byte.
    const raw = await db.query<{ payload: unknown }>(
      "SELECT payload FROM beim_receipts WHERE id = $1",
      [receipt.id]
    );
    expect(raw.rows[0].payload).toEqual(payload);

    // The next insert consumes the previewed number.
    const second = await receiptsRepository.insertReceipt({ clientName: "Segundo", payload: {} });
    expect(second.receiptNumber).toBe(receipt.receiptNumber + 1);
  });

  it("markAnnuled flips Cancelado / Sin abonar / price 0 inside the caller transaction", async () => {
    const receipt = await receiptsRepository.insertReceipt({
      clientName: "Para anular",
      price: "999",
      paymentStatus: "Pagado",
      payload: { motivo: "prueba" }
    });

    await withTransaction(async (tx) => {
      await receiptsRepository.markAnnuled(tx, receipt.id);
    });

    const { rows } = await db.query<{ repairStatus: string; paymentStatus: string; price: string }>(
      "SELECT repair_status AS \"repairStatus\", payment_status AS \"paymentStatus\", price FROM beim_receipts WHERE id = $1",
      [receipt.id]
    );
    expect(rows[0].repairStatus).toBe("Cancelado");
    expect(rows[0].paymentStatus).toBe("Sin abonar");
    expect(rows[0].price).toBe("0");

    await expect(
      withTransaction(async (tx) => {
        await receiptsRepository.markAnnuled(tx, "00000000-0000-0000-0000-000000000000");
      })
    ).rejects.toMatchObject({ status: 404 });
  });
});

describePg("Suite E — orders insert + catalog reader", () => {
  it("creates an order with items and unpaid defaults", async () => {
    const result = await ordersRepository.insertOrder(
      {
        customer: "Cliente Test",
        email: "cliente@test.uy",
        total: 100,
        currency: "UYU",
        comments: "Sin apuro"
      },
      [
        { productId: "smartphone-premium", productCode: null, productName: "Smartphone premium", quantity: 2, unitPrice: 40, currency: "UYU" },
        { productName: "Garantia extendida", quantity: 1, unitPrice: 20, currency: "UYU" }
      ]
    );

    expect(result.order.status).toBe("Pendiente");
    expect(result.order.paymentStatus).toBe("Pendiente de pago");
    expect(result.order.stockCommitted).toBe(false);
    expect(result.order.total).toBe(100);
    expect(result.items).toHaveLength(2);
    expect(result.items.map((i) => i.quantity)).toEqual([2, 1]);

    const { rows } = await db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM order_items WHERE order_id = $1",
      [result.order.id]
    );
    expect(rows[0].n).toBe("2");
  });

  it("catalog reader paginates published products with stable ordering", async () => {
    const page1 = await catalogRepository.listPublished({ page: 1, limit: 3 });
    expect(page1.items).toHaveLength(3);
    expect(page1.total).toBeGreaterThanOrEqual(6);
    expect(page1.totalPages).toBe(Math.ceil(page1.total / 3));

    const page2 = await catalogRepository.listPublished({ page: 2, limit: 3 });
    expect(page2.items).toHaveLength(3);
    const ids1 = page1.items.map((p) => p.id);
    const ids2 = page2.items.map((p) => p.id);
    for (const id of ids2) {
      if (ids1.includes(id)) throw new Error(`duplicate product ${id} across pages`);
    }
    expect(page2.page).toBe(2);
    expect(page2.limit).toBe(3);
  });
});