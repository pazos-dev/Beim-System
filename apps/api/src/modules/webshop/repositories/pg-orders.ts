/**
 * Postgres OrdersPort implementation (task 3.4, PR 4).
 *
 * Orders start unpaid by contract (payment_status 'Pendiente de pago',
 * stock_committed false) and are never marked paid here — only the checkout
 * webhook (future) flips them. Order + items commit in one transaction.
 *
 * Ownership-scoped order reads (listByUser/getByUser) live here; the catalog
 * reader and checkout-session minting live in ./pg-catalog.js and
 * ./pg-checkout-sessions.js and are re-exported below so importers don't
 * change.
 */
import { randomUUID } from "node:crypto";
import { query } from "../../../config/db.js";
import { withTransaction, type TxClient } from "../../../db/withTransaction.js";
import type {
  OrderInsertInput,
  OrderItemInsertInput,
  OrderItemRow,
  OrderRow,
  OrdersPort,
  OrderWithItems
} from "../ports.js";

interface OrderDbRow {
  id: string;
  customer: string;
  email: string | null;
  total: string;
  currency: string;
  status: string;
  payment_status: string;
  stock_committed: boolean;
  created_at: Date;
}

interface OrderItemDbRow {
  id: number;
  order_id: string;
  product_id: string | null;
  product_code: number | null;
  product_name: string;
  quantity: number;
  unit_price: string;
  currency: string;
}

export interface LockedProductRow {
  id: string;
  name: string;
  product_code: number;
  price: string;
  currency: string;
  stock: number;
}

const ORDER_PRODUCT_SQL = `SELECT id, name, product_code, price, currency, stock
   FROM products
   WHERE id = $1 AND published = true
   FOR UPDATE`;

function mapOrderRow(row: OrderDbRow): OrderRow {
  return {
    id: row.id,
    customer: row.customer,
    email: row.email,
    total: Number(row.total),
    currency: row.currency,
    status: row.status,
    paymentStatus: row.payment_status,
    stockCommitted: row.stock_committed,
    createdAt: row.created_at
  };
}

function mapOrderItemRow(row: OrderItemDbRow): OrderItemRow {
  return {
    id: row.id,
    orderId: row.order_id,
    productId: row.product_id,
    productCode: row.product_code,
    productName: row.product_name,
    quantity: row.quantity,
    unitPrice: Number(row.unit_price),
    currency: row.currency
  };
}

async function insertOrderOn(
  tx: TxClient,
  input: OrderInsertInput,
  items: OrderItemInsertInput[]
): Promise<{ order: OrderRow; items: OrderItemRow[] }> {
  const orderId = randomUUID();
  const orderResult = await tx.query<OrderDbRow>(
    `INSERT INTO orders
       (id, customer, email, phone, ci, rut, address, shipping, comments,
        total, currency, status, payment_status, stock_committed, user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'Pendiente', 'Pendiente de pago', false, $12)
     RETURNING *`,
    [
      orderId,
      input.customer,
      input.email ?? null,
      input.phone ?? null,
      input.ci ?? null,
      input.rut ?? null,
      input.address ?? null,
      input.shipping ?? null,
      input.comments ?? null,
      input.total,
      input.currency,
      input.userId ?? null
    ]
  );

  // Single multi-row statement keeps the item insert atomic with the order.
  // Seven placeholders per row: order_id, product_id, product_code,
  // product_name, quantity, unit_price, currency.
  const placeholders: string[] = [];
  const values: unknown[] = [];
  for (const [index, item] of items.entries()) {
    const base = index * 7;
    placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`);
    values.push(
      orderId,
      item.productId ?? null,
      item.productCode ?? null,
      item.productName,
      item.quantity,
      item.unitPrice,
      item.currency
    );
  }
  await tx.query(
    `INSERT INTO order_items (order_id, product_id, product_code, product_name, quantity, unit_price, currency)
     VALUES ${placeholders.join(", ")}`,
    values
  );

  const itemsResult = await tx.query<OrderItemDbRow>(
    "SELECT * FROM order_items WHERE order_id = $1 ORDER BY id",
    [orderId]
  );

  return { order: mapOrderRow(orderResult.rows[0]), items: itemsResult.rows.map(mapOrderItemRow) };
}

export const ordersRepository: OrdersPort & {
  lockProductForUpdate(tx: TxClient, productId: string): Promise<LockedProductRow | undefined>;
} = {
  async lockProductForUpdate(tx, productId) {
    const { rows } = await tx.query<LockedProductRow>(ORDER_PRODUCT_SQL, [productId]);
    return rows[0];
  },

  async insertOrder(input, items, client) {
    if (client !== undefined) return insertOrderOn(client, input, items);
    return withTransaction((tx) => insertOrderOn(tx, input, items));
  },

  async listByUser(userId, options) {
    const page = Math.max(1, Math.trunc(options.page ?? 1) || 1);
    const limit = Math.min(100, Math.max(1, Math.trunc(options.limit ?? 1) || 1));
    const offset = (page - 1) * limit;

    const [itemsResult, countResult] = await Promise.all([
      query<OrderDbRow>(
        "SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3",
        [userId, limit, offset]
      ),
      query<{ total: number }>("SELECT count(*)::int AS total FROM orders WHERE user_id = $1", [userId])
    ]);

    const total = countResult.rows[0].total;
    return {
      page,
      limit,
      total,
      items: itemsResult.rows.map(mapOrderRow)
    };
  },

  async getByUser(userId, orderId): Promise<OrderWithItems | null> {
    const { rows } = await query<OrderDbRow>(
      "SELECT * FROM orders WHERE id = $1 AND user_id = $2",
      [orderId, userId]
    );
    if (rows[0] === undefined) return null;
    const itemsResult = await query<OrderItemDbRow>(
      "SELECT * FROM order_items WHERE order_id = $1 ORDER BY id",
      [orderId]
    );
    return { order: mapOrderRow(rows[0]), items: itemsResult.rows.map(mapOrderItemRow) };
  }
};

/**
 * An order + items by id with NO owner scope. Internal reader for the
 * MercadoPago webhook (issue #84): the IPN arrives without a user session
 * and resolves ownership through the payment's external_reference instead.
 * Reuses the same SELECT statements as getByUser.
 */
export async function getOrderWithItems(orderId: string): Promise<OrderWithItems | null> {
  const { rows } = await query<OrderDbRow>("SELECT * FROM orders WHERE id = $1", [orderId]);
  if (rows[0] === undefined) return null;
  const itemsResult = await query<OrderItemDbRow>(
    "SELECT * FROM order_items WHERE order_id = $1 ORDER BY id",
    [orderId]
  );
  return { order: mapOrderRow(rows[0]), items: itemsResult.rows.map(mapOrderItemRow) };
}

export { catalogRepository } from "./pg-catalog.js";
export { checkoutRepository } from "./pg-checkout-sessions.js";