import { randomUUID } from "node:crypto";
import type { TxClient as DriverClient } from "../../db/withTransaction.js";
import type { TxClient } from "../../domain/shared/ports.js";
import {
  ConflictError,
  InsufficientStockError,
  NotFoundError,
  ValidationError
} from "../../errors/taxonomy.js";
import type { Venta } from "../../domain/venta/venta.js";
import { toVenta, type VentaItemRow, type VentaOrderRow, type VentaSessionRow } from "./pg-venta.mapper.js";

/**
 * Venta/Checkout persistence (slice 3.1, change `clean-arch-infrastructure`).
 *
 * Driven adapter over the legacy webshop tables. Every statement is copied
 * byte-identical from `modules/webshop/repositories/pg-orders.ts`
 * (`ORDER_PRODUCT_SQL`, order insert defaults, multi-row items),
 * `pg-checkout-sessions.ts` (session mint) and `pg-payments.ts`
 * (`setPreferenceId` overwrite). Pricing is server-side from the locked
 * rows; stock is checked but never decremented (check-not-reserve — payment
 * commits it via the webhook slice). One `TxClient` per call: guards run
 * before the first INSERT, so a 409 shortfall leaves zero partial writes.
 *
 * DELTA (needs spec ratification, same class as I2/I3 additives): `Venta`
 * carries no customer/user and `orders.customer` is NOT NULL, so the create
 * input mirrors the legacy `OrderInsertInput` (caller supplies `customer`);
 * the application `save(tx, venta)` binding waits for customer-in-DTO.
 */

export interface VentaCustomerInput {
  id?: string;
  customer: string;
  email?: string | null;
  phone?: string | null;
  ci?: string | null;
  rut?: string | null;
  address?: string | null;
  shipping?: string | null;
  comments?: string | null;
  userId?: string | null;
}

export interface VentaLineInput {
  productId: string;
  quantity: number;
}

export interface CheckoutSessionInput {
  id: string;
  userId: string;
  orderId: string;
  paymentMethodId?: string | null;
  expiresAt: Date;
}

/** Byte-identical to `pg-orders.ts` `ORDER_PRODUCT_SQL`. */
const LOCK_PRODUCT_SQL = `SELECT id, name, product_code, price, currency, stock
   FROM products
   WHERE id = $1 AND published = true
   FOR UPDATE`;

/** Byte-identical to `pg-orders.ts` `insertOrderOn` (unpaid defaults). */
const INSERT_ORDER_SQL = `INSERT INTO orders
       (id, customer, email, phone, ci, rut, address, shipping, comments,
        total, currency, status, payment_status, stock_committed, user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'Pendiente', 'Pendiente de pago', false, $12)
     RETURNING *`;

/** Byte-identical item insert head from `pg-orders.ts` (7 values per row). */
const INSERT_ITEMS_HEAD =
  "INSERT INTO order_items (order_id, product_id, product_code, product_name, quantity, unit_price, currency)";

const SELECT_ORDER_BY_ID = "SELECT * FROM orders WHERE id = $1";
const SELECT_ITEMS_BY_ORDER = "SELECT * FROM order_items WHERE order_id = $1 ORDER BY id";
const SELECT_PENDING_SESSION =
  "SELECT id, order_id, status, created_at, expires_at FROM checkout_sessions WHERE order_id = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 1";

/** Byte-identical to `ordersService` pending guard in `services/orders.ts`. */
const COUNT_PENDING_SQL =
  "SELECT count(*)::text AS n FROM checkout_sessions WHERE order_id = $1 AND status = 'pending'";

/** Byte-identical to `pg-checkout-sessions.ts` `create`. */
const INSERT_CHECKOUT_SQL = `INSERT INTO checkout_sessions (id, user_id, order_id, payment_method_id, status, expires_at)
       VALUES ($1, $2, $3, $4, 'pending', $5)
       RETURNING *`;

/** Byte-identical to `pg-payments.ts` `setPreferenceId` (fresh overwrite). */
const SET_PREFERENCE_SQL = "UPDATE orders SET mp_preference_id = $2 WHERE id = $1";

const SELECT_PAYMENT_STATUS = "SELECT payment_status FROM orders WHERE id = $1 AND user_id = $2";
const PENDING_PAYMENT = "Pendiente de pago";

interface LockedProduct {
  id: string;
  name: string;
  product_code: number;
  price: string;
  currency: string;
  stock: number;
}

function driverOf(tx: TxClient): DriverClient {
  const candidate = tx as unknown as { query?: unknown };
  if (typeof candidate.query !== "function") {
    throw new Error("PgVentaAdapter requires a pg TxClient");
  }
  return tx as unknown as DriverClient;
}

export class PgVentaAdapter {
  async findById(tx: TxClient, id: string): Promise<Venta | null> {
    const client = driverOf(tx);
    const order = await client.query<VentaOrderRow>(SELECT_ORDER_BY_ID, [id]);
    if (order.rows[0] === undefined) return null;
    const items = await client.query<VentaItemRow>(SELECT_ITEMS_BY_ORDER, [id]);
    const session = await client.query<VentaSessionRow>(SELECT_PENDING_SESSION, [id]);
    return toVenta(order.rows[0], items.rows, session.rows[0] ?? null);
  }

  /**
   * Lock-then-insert: every line locks its product row `FOR UPDATE`, guards
   * stock (shortfall → 409) and prices server-side; the order (legacy
   * unpaid defaults) plus all items commit in one multi-row statement on
   * the same connection. Check-not-reserve: stock is never decremented.
   */
  async insertVenta(tx: TxClient, input: VentaCustomerInput, lines: VentaLineInput[]): Promise<Venta> {
    const client = driverOf(tx);
    const locked: LockedProduct[] = [];
    let currency: string | null = null;
    for (const line of lines) {
      const found = await client.query<LockedProduct>(LOCK_PRODUCT_SQL, [line.productId]);
      const row = found.rows[0];
      if (row === undefined) throw new NotFoundError(`Producto no encontrado: ${line.productId}`);
      if (row.stock < line.quantity) {
        throw new InsufficientStockError(undefined, { currentStock: row.stock });
      }
      if (currency === null) currency = row.currency;
      else if (currency !== row.currency) {
        throw new ValidationError("Moneda inconsistente entre productos del carrito");
      }
      locked.push(row);
    }
    const total = locked.reduce(
      (sum, row, index) => sum + Number(row.price) * lines[index].quantity,
      0
    );
    const orderId = input.id ?? randomUUID();
    const inserted = await client.query<VentaOrderRow>(INSERT_ORDER_SQL, [
      orderId,
      input.customer,
      input.email ?? null,
      input.phone ?? null,
      input.ci ?? null,
      input.rut ?? null,
      input.address ?? null,
      input.shipping ?? null,
      input.comments ?? null,
      total,
      currency ?? "UYU",
      input.userId ?? null
    ]);
    const placeholders: string[] = [];
    const values: unknown[] = [];
    for (const [index, line] of lines.entries()) {
      const base = index * 7;
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`
      );
      values.push(
        orderId,
        locked[index].id,
        locked[index].product_code,
        locked[index].name,
        line.quantity,
        Number(locked[index].price),
        locked[index].currency
      );
    }
    await client.query(`${INSERT_ITEMS_HEAD}\n     VALUES ${placeholders.join(", ")}`, values);
    const items = await client.query<VentaItemRow>(SELECT_ITEMS_BY_ORDER, [orderId]);
    return toVenta(inserted.rows[0], items.rows, null);
  }

  /**
   * Mints one pending checkout session (byte-identical INSERT). Second
   * pending → 409 before any write; non-pending orders → 409.
   */
  async createCheckoutSession(tx: TxClient, input: CheckoutSessionInput) {
    const client = driverOf(tx);
    const order = await client.query<{ payment_status: string }>(SELECT_PAYMENT_STATUS, [
      input.orderId,
      input.userId
    ]);
    if (order.rows[0] === undefined) throw new NotFoundError(`Orden no encontrada: ${input.orderId}`);
    if (order.rows[0].payment_status !== PENDING_PAYMENT) {
      throw new ConflictError("La orden ya no está pendiente de pago");
    }
    const pending = await client.query<{ n: string }>(COUNT_PENDING_SQL, [input.orderId]);
    if (Number(pending.rows[0].n) > 0) {
      throw new ConflictError("Ya existe una sesión de checkout pendiente para esta orden");
    }
    const created = await client.query(INSERT_CHECKOUT_SQL, [
      input.id,
      input.userId,
      input.orderId,
      input.paymentMethodId ?? null,
      input.expiresAt
    ]);
    return created.rows[0];
  }

  /** Fresh preference overwrites the stored id (no reuse, legacy parity). */
  async setPreferenceId(tx: TxClient, orderId: string, preferenceId: string): Promise<void> {
    await driverOf(tx).query(SET_PREFERENCE_SQL, [orderId, preferenceId]);
  }
}
