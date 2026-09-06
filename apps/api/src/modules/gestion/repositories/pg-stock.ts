/**
 * Postgres StockPort implementation (task 3.4 + PR 3).
 *
 * Stock safety contract (spec: "Concurrent decrement safe"): the product row
 * is locked SELECT ... FOR UPDATE inside the transaction, the guard runs on
 * the locked value, and the decrement happens on the same connection before
 * COMMIT. Two concurrent sales on stock=1 serialize on the row lock: exactly
 * one commits, the other observes stock 0 and rejects with 409.
 *
 * Every method accepts an optional `client`: sales-batch and annul pass their
 * own transaction so the whole unit of work shares ONE connection (no nested
 * transactions, no second pool checkout).
 */
import { withTransaction, type TxClient } from "../../../db/withTransaction.js";
import { InsufficientStockError, NotFoundError } from "../../../errors/taxonomy.js";
import type { StockPort } from "../ports.js";

const LOCK_PRODUCT = "SELECT stock FROM products WHERE id = $1 FOR UPDATE";
const DECREMENT_STOCK =
  "UPDATE products SET stock = stock - $2, updated_at = now() WHERE id = $1 RETURNING stock";
const RESTORE_STOCK =
  "UPDATE products SET stock = stock + $2, updated_at = now() WHERE id = $1 RETURNING id";
const PRICES_BY_IDS =
  "SELECT id, price FROM products WHERE id = ANY($1) AND price IS NOT NULL";

async function runOn<T>(client: TxClient | undefined, fn: (tx: TxClient) => Promise<T>): Promise<T> {
  return client !== undefined ? fn(client) : withTransaction(fn);
}

export const stockRepository: StockPort = {
  async guardDecrement(productId, qty, client) {
    return runOn(client, async (tx) => {
      const locked = await tx.query<{ stock: number }>(LOCK_PRODUCT, [productId]);
      const row = locked.rows[0];
      if (row === undefined) {
        throw new NotFoundError(`Producto no encontrado: ${productId}`);
      }
      if (row.stock < qty) {
        throw new InsufficientStockError(undefined, { currentStock: row.stock });
      }
      const updated = await tx.query<{ stock: number }>(DECREMENT_STOCK, [productId, qty]);
      return { currentStock: updated.rows[0].stock };
    });
  },

  async restore(productId, qty, client) {
    return runOn(client, async (tx) => {
      const updated = await tx.query(RESTORE_STOCK, [productId, qty]);
      if (updated.rowCount === 0) {
        throw new NotFoundError(`Producto no encontrado: ${productId}`);
      }
    });
  },

  async getPricesByIds(ids, client) {
    return runOn(client, async (tx) => {
      const { rows } = await tx.query<{ id: string; price: string }>(PRICES_BY_IDS, [ids]);
      const prices = new Map<string, number>();
      for (const row of rows) {
        prices.set(row.id, Number(row.price));
      }
      return prices;
    });
  }
};