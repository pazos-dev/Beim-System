import { query } from "../../config/db.js";
import { withTransaction, type TxClient } from "../../db/withTransaction.js";
import {
  InsufficientStockError,
  NotFoundError,
  ValidationError
} from "../../errors/taxonomy.js";
import {
  allocateTallerLots,
  allocateVentaLots,
  type StockLot
} from "../../domain/product/stock-lot.js";
import type {
  ProductRepository,
  ProductWithLots
} from "../../domain/product/product.repository.js";
import {
  createMoney,
  type Money,
  type ProductId
} from "../../domain/shared/types.js";
import { queryOn } from "./pg-session.adapter.js";
import {
  toDomainLot,
  toDomainProduct,
  type ProductRow,
  type StockLotRow
} from "./pg-product.mapper.js";

/**
 * Product/StockLot persistence (slice I3, change `clean-arch-infrastructure`).
 *
 * Implements the `domain/product` `ProductRepository` port. Product-level
 * statements are copied byte-identical from
 * `modules/gestion/repositories/pg-stock.ts` (`LOCK_PRODUCT`,
 * `DECREMENT_STOCK`, `RESTORE_STOCK`, `PRICES_BY_IDS`); lot statements are
 * NEW SQL under the approved `0006` delta (the table did not exist before).
 *
 * `allocate` is the guarded sale path: lock the product row `FOR UPDATE`,
 * guard on the locked stock (shortfall → 409 `INSUFFICIENT_STOCK`),
 * decrement on the same connection, then consume `purpose` lots FIFO via the
 * domain allocator (lane pricing `salePriceOverride ?? price`; lanes never
 * mix) and persist each consumed `remaining_qty`. Two concurrent sales on
 * stock 1 serialize on the row lock: exactly one commits.
 *
 * DELTA (needs spec ratification, same class as I2 `findById`): no legacy
 * by-id product read or product UPDATE exists, so `SELECT_PRODUCT_BY_ID`
 * (with the `pg-reports` `price::text` passthrough) and `SAVE_PRODUCT`
 * (stock + price, the fields the stock/pricing paths own) are additive,
 * read/persist-only, zero legacy behavior change.
 */
const SELECT_PRODUCT_BY_ID =
  "SELECT id, product_code, name, category_id, brand, model, price::text AS price, currency, stock, badge, image, description, product_type, compatible_models, supplier_name, supplier_lot, min_stock, warranty_days, published, created_at, updated_at FROM products WHERE id = $1";

const SAVE_PRODUCT = "UPDATE products SET stock = $2, price = $3, updated_at = now() WHERE id = $1";

const SELECT_LOTS_FIFO =
  "SELECT id, product_id, initial_qty, remaining_qty, unit_cost, currency, sale_price, sale_price_currency, purpose, acquired_via, supplier_lot, created_at FROM stock_lots WHERE product_id = $1 AND purpose = $2 AND remaining_qty > 0 ORDER BY created_at ASC FOR UPDATE";

const UPDATE_LOT_REMAINING = "UPDATE stock_lots SET remaining_qty = $2 WHERE id = $1";

const UPSERT_LOT =
  "INSERT INTO stock_lots (id, product_id, initial_qty, remaining_qty, unit_cost, currency, sale_price, sale_price_currency, purpose, acquired_via, supplier_lot) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT (id) DO UPDATE SET initial_qty = EXCLUDED.initial_qty, remaining_qty = EXCLUDED.remaining_qty, unit_cost = EXCLUDED.unit_cost, sale_price = EXCLUDED.sale_price";

export type LotPurpose = "venta" | "taller";

export interface LotAllocation {
  readonly lotId: string;
  readonly qty: number;
  /** Lane price for `venta` (`salePriceOverride ?? price`); null for `taller`. */
  readonly unitPrice: Money | null;
}

function isLotPurpose(value: string): value is LotPurpose {
  return value === "venta" || value === "taller";
}

export class PgProductAdapter implements ProductRepository {
  async findById(id: ProductId, client?: TxClient) {
    const rows = await queryOn<ProductRow>(client, SELECT_PRODUCT_BY_ID, [id]);
    return rows[0] === undefined ? null : toDomainProduct(rows[0]);
  }

  async save(product: Parameters<ProductRepository["save"]>[0], client?: TxClient): Promise<void> {
    const run = async (tx: TxClient): Promise<void> => {
      const updated = await tx.query(SAVE_PRODUCT, [product.id, product.stock, product.price.amount]);
      if (updated.rowCount === 0) {
        throw new NotFoundError(`Producto no encontrado: ${product.id}`);
      }
    };
    if (client !== undefined) await run(client);
    else await withTransaction(run);
  }

  async findWithLots(id: ProductId, client?: TxClient): Promise<ProductWithLots | null> {
    const run = async (tx: TxClient): Promise<ProductWithLots | null> => {
      const product = await this.findById(id, tx);
      if (product === null) return null;
      const lots = await this.loadAllLots(id, tx);
      return { product, lots };
    };
    if (client !== undefined) return run(client);
    return withTransaction(run);
  }

  async saveWithLots(input: ProductWithLots, client?: TxClient): Promise<void> {
    const run = async (tx: TxClient): Promise<void> => {
      await this.save(input.product, tx);
      for (const lot of input.lots) {
        await tx.query(UPSERT_LOT, [
          lot.id,
          lot.productId,
          lot.initialQty,
          lot.remainingQty,
          lot.unitCost.amount,
          lot.unitCost.currency,
          lot.salePriceOverride === null ? null : lot.salePriceOverride.amount,
          lot.salePriceOverride === null ? "UYU" : lot.salePriceOverride.currency,
          lot.purpose,
          lot.acquiredVia,
          lot.supplierLot
        ]);
      }
    };
    if (client !== undefined) await run(client);
    else await withTransaction(run);
  }

  /**
   * Guarded decrement + FIFO lane consume on ONE connection. Returns the
   * post-decrement stock and per-lot allocations.
   */
  async allocate(
    id: ProductId,
    qty: number,
    purpose: string,
    client?: TxClient
  ): Promise<{ stock: number; allocations: LotAllocation[] }> {
    if (!isLotPurpose(purpose)) {
      throw new ValidationError("Lote inválido: purpose debe ser venta o taller", { purpose });
    }
    const run = async (tx: TxClient) => {
      const locked = await tx.query<{ stock: number }>(
        "SELECT stock FROM products WHERE id = $1 FOR UPDATE",
        [id]
      );
      const current = locked.rows[0];
      if (current === undefined) {
        throw new NotFoundError(`Producto no encontrado: ${id}`);
      }
      if (!Number.isInteger(qty) || qty <= 0) {
        throw new ValidationError("Producto inválido: cantidad a descontar debe ser un entero positivo", {
          qty
        });
      }
      if (current.stock < qty) {
        throw new InsufficientStockError(undefined, { currentStock: current.stock });
      }
      const prices = await tx.query<{ id: string; price: string }>(
        "SELECT id, price FROM products WHERE id = ANY($1) AND price IS NOT NULL",
        [[id]]
      );
      const priceRow = prices.rows[0];
      const productPrice =
        priceRow === undefined
          ? createMoney(0, "UYU")
          : createMoney(Number(priceRow.price), "UYU");
      const lotRows = await tx.query<StockLotRow>(SELECT_LOTS_FIFO, [id, purpose]);
      const lots: StockLot[] = lotRows.rows.map(toDomainLot);
      let updatedLots: StockLot[];
      let allocations: LotAllocation[];
      if (purpose === "venta") {
        const result = allocateVentaLots(lots, qty, productPrice);
        updatedLots = result.lots;
        allocations = result.allocations.map((take) => ({
          lotId: take.lotId,
          qty: take.qty,
          unitPrice: take.unitPrice
        }));
      } else {
        const result = allocateTallerLots(lots, qty);
        updatedLots = result.lots;
        allocations = result.allocations.map((take) => ({
          lotId: take.lotId,
          qty: take.qty,
          unitPrice: null
        }));
      }
      const decremented = await tx.query<{ stock: number }>(
        "UPDATE products SET stock = stock - $2, updated_at = now() WHERE id = $1 RETURNING stock",
        [id, qty]
      );
      const remainingById = new Map(updatedLots.map((lot) => [lot.id, lot.remainingQty] as const));
      for (const [lotId, remaining] of remainingById) {
        const before = lots.find((lot) => lot.id === lotId);
        if (before !== undefined && before.remainingQty !== remaining) {
          await tx.query(UPDATE_LOT_REMAINING, [lotId, remaining]);
        }
      }
      return { stock: decremented.rows[0].stock, allocations };
    };
    if (client !== undefined) return run(client);
    return withTransaction(run);
  }

  /** Legacy restore path (byte-identical `RESTORE_STOCK`). */
  async restore(id: ProductId, qty: number, client?: TxClient): Promise<void> {
    const run = async (tx: TxClient): Promise<void> => {
      const updated = await tx.query(
        "UPDATE products SET stock = stock + $2, updated_at = now() WHERE id = $1 RETURNING id",
        [id, qty]
      );
      if (updated.rowCount === 0) {
        throw new NotFoundError(`Producto no encontrado: ${id}`);
      }
    };
    if (client !== undefined) await run(client);
    else await withTransaction(run);
  }

  private async loadAllLots(id: ProductId, tx: TxClient): Promise<StockLot[]> {
    const rows = await queryOn<StockLotRow>(
      tx,
      "SELECT id, product_id, initial_qty, remaining_qty, unit_cost, currency, sale_price, sale_price_currency, purpose, acquired_via, supplier_lot, created_at FROM stock_lots WHERE product_id = $1 ORDER BY created_at ASC",
      [id]
    );
    return rows.map(toDomainLot);
  }
}
