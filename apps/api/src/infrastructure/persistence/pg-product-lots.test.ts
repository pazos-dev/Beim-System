/**
 * Product/StockLot adapters (slice I3, change `clean-arch-infrastructure`).
 *
 * DB-free: mapper unit tests (legacy `price` text passthrough,
 * `salePriceOverride` null/value) + SQL-text asserts. Statements re-homed
 * from `modules/gestion/repositories/pg-stock.ts` MUST be byte-identical;
 * lot statements are NEW (the `stock_lots` table ships in `0006`, same slice).
 */
process.env.DATABASE_URL ??= "postgres://beim@127.0.0.1:5432/beim_api_test";

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import { InsufficientStockError } from "../../errors/taxonomy.js";
import type { ProductId } from "../../domain/shared/types.js";
import { createProductId } from "../../domain/shared/types.js";
import type { ProductRepository } from "../../domain/product/product.repository.js";

const { PgProductAdapter } = await import("./pg-product.adapter.js");
const { toDomainLot, toDomainProduct } = await import("./pg-product.mapper.js");

const PRODUCT_ID = "prod-001";
const LOT_A = "lot-a";
const LOT_B = "lot-b";

const LOCK_PRODUCT = "SELECT stock FROM products WHERE id = $1 FOR UPDATE";
const DECREMENT_STOCK =
  "UPDATE products SET stock = stock - $2, updated_at = now() WHERE id = $1 RETURNING stock";
const RESTORE_STOCK =
  "UPDATE products SET stock = stock + $2, updated_at = now() WHERE id = $1 RETURNING id";
const PRICES_BY_IDS = "SELECT id, price FROM products WHERE id = ANY($1) AND price IS NOT NULL";

function productRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PRODUCT_ID,
    product_code: 7,
    name: "Taladro 12V",
    category_id: "cat-1",
    brand: "Beim",
    model: "T12",
    price: "1234.50",
    currency: "UYU",
    stock: 5,
    badge: "Nuevo",
    image: null,
    description: "",
    product_type: "equipo",
    compatible_models: ["T12"],
    supplier_name: "Distri",
    supplier_lot: "L1",
    min_stock: 1,
    warranty_days: 30,
    published: true,
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    updated_at: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides
  };
}

function lotRow(overrides: Record<string, unknown> = {}) {
  return {
    id: LOT_A,
    product_id: PRODUCT_ID,
    initial_qty: 5,
    remaining_qty: 5,
    unit_cost: "800.00",
    currency: "UYU",
    sale_price: null,
    sale_price_currency: "UYU",
    purpose: "venta",
    acquired_via: "migracion",
    supplier_lot: "",
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides
  };
}

/** Queued stub: each `query` shifts the next scripted `{ rows, rowCount }`. */
function stubClient(captured: string[], script: Array<{ rows?: unknown[]; rowCount?: number }>) {
  const client = {
    query: async (text: string) => {
      captured.push(text);
      const next = script.shift() ?? { rows: [] as unknown[], rowCount: 0 };
      return { rows: next.rows ?? [], rowCount: next.rowCount ?? 0 };
    }
  } as unknown as PoolClient;
  return client;
}

describe("product/lot mappers (legacy price-text passthrough)", () => {
  it("maps a product row with numeric price arriving as text", () => {
    const product = toDomainProduct(productRow());

    expect(product.id).toBe(createProductId(PRODUCT_ID));
    expect(product.price).toEqual({ amount: 1234.5, currency: "UYU" });
    expect(product.stock).toBe(5);
    expect(product.productType).toBe("equipo");
    expect(product.compatibleModels).toEqual(["T12"]);
    expect(product.createdAt).toEqual(new Date("2026-01-01T00:00:00.000Z"));
  });

  it("maps a lot row with a null sale price to a null override", () => {
    const lot = toDomainLot(lotRow());

    expect(lot.purpose).toBe("venta");
    expect(lot.remainingQty).toBe(5);
    expect(lot.unitCost).toEqual({ amount: 800, currency: "UYU" });
    expect(lot.salePriceOverride).toBeNull();
  });

  it("maps a lot row carrying a sale-price override as text", () => {
    const lot = toDomainLot(lotRow({ id: LOT_B, sale_price: "1500.00" }));

    expect(lot.salePriceOverride).toEqual({ amount: 1500, currency: "UYU" });
  });

  it("rejects a lot row outside the closed purpose set", () => {
    expect(() => toDomainLot(lotRow({ purpose: "deposito" }))).toThrow();
  });
});

describe("PgProductAdapter SQL text (pg-stock byte-identical + new lot SQL)", () => {
  it("implements the ProductRepository port", () => {
    const repo: ProductRepository = new PgProductAdapter();
    expect(repo.findWithLots).toBeDefined();
    expect(repo.saveWithLots).toBeDefined();
  });

  it("allocate locks FOR UPDATE, guards on the locked value, then decrements", async () => {
    const adapter = new PgProductAdapter();
    const captured: string[] = [];
    const client = stubClient(captured, [
      { rows: [{ stock: 5 }] },
      { rows: [{ id: PRODUCT_ID, price: "1234.50" }] },
      { rows: [lotRow()] },
      { rows: [{ stock: 3 }] },
      { rows: [{ remaining_qty: 3 }] }
    ]);

    const result = await adapter.allocate(createProductId(PRODUCT_ID) as ProductId, 2, "venta", client);

    expect(result.stock).toBe(3);
    expect(result.allocations).toEqual([
      { lotId: LOT_A, qty: 2, unitPrice: { amount: 1234.5, currency: "UYU" } }
    ]);
    expect(captured[0]).toBe(LOCK_PRODUCT);
    expect(captured[1]).toBe(PRICES_BY_IDS);
    expect(captured[2]).toBe(
      "SELECT id, product_id, initial_qty, remaining_qty, unit_cost, currency, sale_price, sale_price_currency, purpose, acquired_via, supplier_lot, created_at FROM stock_lots WHERE product_id = $1 AND purpose = $2 AND remaining_qty > 0 ORDER BY created_at ASC FOR UPDATE"
    );
    expect(captured[3]).toBe(DECREMENT_STOCK);
    expect(captured[4]).toBe("UPDATE stock_lots SET remaining_qty = $2 WHERE id = $1");
  });

  it("allocate shortfall raises 409 and emits no decrement", async () => {
    const adapter = new PgProductAdapter();
    const captured: string[] = [];
    const client = stubClient(captured, [{ rows: [{ stock: 1 }] }]);

    await expect(adapter.allocate(createProductId(PRODUCT_ID) as ProductId, 2, "venta", client)).rejects.toBeInstanceOf(
      InsufficientStockError
    );
    expect(captured).toEqual([LOCK_PRODUCT]);
  });

  it("restore emits the pg-stock restore text", async () => {
    const adapter = new PgProductAdapter();
    const captured: string[] = [];
    const client = stubClient(captured, [{ rows: [{ id: PRODUCT_ID }], rowCount: 1 }]);

    await adapter.restore(createProductId(PRODUCT_ID) as ProductId, 2, client);

    expect(captured).toEqual([RESTORE_STOCK]);
  });
});

describe("DDL 0006 stock_lots (up + down)", () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const sql = readFileSync(join(dir, "..", "..", "db", "migrations", "0006-stock-lots.sql"), "utf8");

  it("creates stock_lots with the purpose check and a venta seed under lock", () => {
    expect(sql).toContain("create table if not exists stock_lots");
    expect(sql).toContain("check (purpose in ('venta', 'taller'))");
    expect(sql).toContain("LOCK TABLE products IN SHARE ROW EXCLUSIVE MODE");
    expect(sql).toContain("'venta'");
    expect(sql).toContain("on conflict (id) do nothing");
  });

  it("ships a down-migration dropping only the lots table", () => {
    expect(sql).toMatch(/-- DOWN: DROP TABLE IF EXISTS stock_lots;/);
  });
});
