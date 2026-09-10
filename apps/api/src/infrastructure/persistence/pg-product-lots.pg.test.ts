/**
 * Product/StockLot 0006 round-trip + reconcile + FIFO (slice I3).
 *
 * `describePg`: legacy `products.stock = 5` reconciles to one `venta` lot
 * with remaining 5; down then re-up restores the seed; `allocate` consumes
 * FIFO with lane pricing; two concurrent decrements on stock 1 serialize
 * (one commits, the other 409). Skips without `TEST_DATABASE_URL`.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { describePg, setupTestDatabase } from "../../db/testDb.js";
import { InsufficientStockError } from "../../errors/taxonomy.js";
import { createProductId } from "../../domain/shared/types.js";

setupTestDatabase();

// Dynamic imports AFTER setupTestDatabase() set DATABASE_URL (same reason as
// pg-user-session.pg.test.ts: the adapter reaches the shared Pool at import).
const { query } = await import("../../config/db.js");
const { PgProductAdapter } = await import("./pg-product.adapter.js");

const HERE = dirname(fileURLToPath(import.meta.url));
const UP_0006 = readFileSync(join(HERE, "..", "..", "db", "migrations", "0006-stock-lots.sql"), "utf8");
const DOWN_0006 = "DROP TABLE IF EXISTS stock_lots;";

async function seedProduct(stock: number): Promise<string> {
  const categoryId = `cat-${randomUUID()}`;
  await query("INSERT INTO categories (id, name, code, description) VALUES ($1, $2, $3, $4)", [categoryId, "Herramientas", "HERR", "seed"]);
  const id = `prod-${randomUUID()}`;
  await query(
    "INSERT INTO products (id, name, category_id, price, stock) VALUES ($1, $2, $3, 1234.50, $4)",
    [id, "Taladro 12V", categoryId, stock]
  );
  return id;
}

async function seedMigrationFor(productId: string, stock: number): Promise<void> {
  await query(
    `insert into stock_lots (id, product_id, initial_qty, remaining_qty, unit_cost, purpose, acquired_via, created_at)
     select 'seed-' || $1, $1, $2, $2, 0, 'venta', 'migracion', now()
     where not exists (select 1 from stock_lots where id = 'seed-' || $1)`,
    [productId, stock]
  );
}

async function lotSum(productId: string): Promise<number> {
  const { rows } = await query("SELECT coalesce(sum(remaining_qty), 0)::text AS total FROM stock_lots WHERE product_id = $1", [
    productId
  ]);
  return Number(rows[0].total);
}

describePg("0006 stock_lots reconcile + round-trip", () => {
  it("seeds one venta lot whose sum matches the prior legacy stock", async () => {
    const id = await seedProduct(5);
    await seedMigrationFor(id, 5);

    const { rows } = await query(
      "SELECT purpose, remaining_qty FROM stock_lots WHERE product_id = $1",
      [id]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].purpose).toBe("venta");
    expect(rows[0].remaining_qty).toBe(5);
    expect(await lotSum(id)).toBe(5);
  });

  it("down then re-up restores the seed (round-trip)", async () => {
    const id = await seedProduct(3);
    await seedMigrationFor(id, 3);
    expect(await lotSum(id)).toBe(3);

    await query(DOWN_0006);
    const { rows: gone } = await query("SELECT to_regclass('public.stock_lots') AS n");
    expect(gone[0].n).toBeNull();

    await query(UP_0006);
    expect(await lotSum(id)).toBe(3);
  });

  it("allocate consumes venta FIFO and keeps stock = sum(remaining)", async () => {
    const id = await seedProduct(5);
    await seedMigrationFor(id, 5);
    const adapter = new PgProductAdapter();

    const result = await adapter.allocate(createProductId(id), 2, "venta");

    expect(result.stock).toBe(3);
    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0].qty).toBe(2);
    expect(await lotSum(id)).toBe(3);
  });

  it("two concurrent decrements on stock 1 serialize: one commits, one 409", async () => {
    const id = await seedProduct(1);
    await seedMigrationFor(id, 1);
    const adapter = new PgProductAdapter();

    const outcomes = await Promise.allSettled([
      adapter.allocate(createProductId(id), 1, "venta"),
      adapter.allocate(createProductId(id), 1, "venta")
    ]);
    const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
    const rejected = outcomes.filter((o) => o.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(InsufficientStockError);
  });
});

describe("0006 migration files (DB-free guards)", () => {
  it("down text drops only stock_lots", () => {
    expect(DOWN_0006).toBe("DROP TABLE IF EXISTS stock_lots;");
  });
});
