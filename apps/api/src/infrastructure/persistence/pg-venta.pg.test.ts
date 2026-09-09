/**
 * Venta atomic batch (slice 3.1, change `clean-arch-infrastructure`).
 *
 * `describePg`: two lines with one exceeding the locked stock abort with
 * 409 leaving zero partial writes (no order, no items); the happy path
 * inserts with the legacy unpaid defaults. Skips without TEST_DATABASE_URL.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { describePg, setupTestDatabase } from "../../db/testDb.js";
import type { TxClient } from "../../domain/shared/ports.js";
import { InsufficientStockError } from "../../errors/taxonomy.js";

setupTestDatabase();

const { query } = await import("../../config/db.js");
const { withTransaction } = await import("../../db/withTransaction.js");
const { PgVentaAdapter } = await import("./pg-venta.adapter.js");

type PgTx = Parameters<Parameters<typeof withTransaction>[0]>[0];

function bridge(tx: PgTx): TxClient {
  return tx as unknown as TxClient;
}

async function seedProduct(id: string, stock: number, price: string): Promise<void> {
  await query("INSERT INTO categories (id, name, code, description) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING", [
    "cat-venta",
    "Venta",
    "venta",
    "seed"
  ]);
  await query(
    "INSERT INTO products (id, name, category_id, price, currency, stock, published) VALUES ($1, $2, $3, $4, 'UYU', $5, true)",
    [id, `Repuesto ${id}`, "cat-venta", price, stock]
  );
}

describePg("venta atomic batch via port", () => {
  it("a short locked line aborts with 409 and zero partial writes", async () => {
    const okId = randomUUID();
    const shortId = randomUUID();
    await seedProduct(okId, 5, "500.00");
    await seedProduct(shortId, 0, "500.00");
    const adapter = new PgVentaAdapter();
    const ventaId = randomUUID();

    await expect(
      withTransaction((tx) =>
        adapter.insertVenta(
          bridge(tx),
          { id: ventaId, customer: "Mostrador" },
          [
            { productId: okId, quantity: 1 },
            { productId: shortId, quantity: 2 }
          ]
        )
      )
    ).rejects.toBeInstanceOf(InsufficientStockError);

    const orders = await query("SELECT count(*)::text AS n FROM orders WHERE id = $1", [ventaId]);
    expect(orders.rows[0].n).toBe("0");
    const items = await query("SELECT count(*)::text AS n FROM order_items WHERE order_id = $1", [ventaId]);
    expect(items.rows[0].n).toBe("0");
  });

  it("the happy path inserts with legacy unpaid defaults", async () => {
    const productId = randomUUID();
    await seedProduct(productId, 5, "500.00");
    const adapter = new PgVentaAdapter();
    const ventaId = randomUUID();

    const venta = await withTransaction((tx) =>
      adapter.insertVenta(bridge(tx), { id: ventaId, customer: "Web" }, [{ productId, quantity: 2 }])
    );

    expect(venta.total).toEqual({ amount: 1000, currency: "UYU" });
    const { rows } = await query<{
      status: string;
      payment_status: string;
      stock_committed: boolean;
    }>("SELECT status, payment_status, stock_committed FROM orders WHERE id = $1", [ventaId]);
    expect(rows[0]).toMatchObject({
      status: "Pendiente",
      payment_status: "Pendiente de pago",
      stock_committed: false
    });
  });
});
