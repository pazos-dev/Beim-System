/**
 * Postgres OrdersPort + catalog reader implementation (task 3.4, PR 4).
 *
 * Orders start unpaid by contract (payment_status 'Pendiente de pago',
 * stock_committed false) and are never marked paid here — only the checkout
 * webhook (future) flips them. Order + items commit in one transaction.
 *
 * PR 4 additions: published-only catalog reads with category/search filters,
 * single-product reads, ownership-scoped order reads (listByUser/getByUser)
 * and checkout-session minting (checkout_sessions table, migration 0001).
 */
import { randomUUID } from "node:crypto";
import { query } from "../../../config/db.js";
import { withTransaction, type TxClient } from "../../../db/withTransaction.js";
import type {
  CatalogItem,
  CatalogListOptions,
  CatalogPage,
  CatalogPort,
  CheckoutSessionRow,
  CheckoutSessionsPort,
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
        total, currency, status, payment_status, stock_committed)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'Pendiente', 'Pendiente de pago', false)
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
      input.currency
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

export const ordersRepository: OrdersPort = {
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

interface ProductDbRow {
  id: string;
  product_code: number | null;
  name: string;
  category_id: string;
  brand: string;
  model: string;
  price: string;
  currency: string;
  stock: number;
  badge: string;
  image: string | null;
  description: string;
}

function mapProduct(row: ProductDbRow): CatalogItem {
  return {
    id: row.id,
    productCode: row.product_code,
    name: row.name,
    categoryId: row.category_id,
    brand: row.brand,
    model: row.model,
    price: Number(row.price),
    currency: row.currency,
    stock: row.stock,
    badge: row.badge,
    image: row.image,
    description: row.description
  };
}

/**
 * Catalog visibility contract (PR 4): `published = true` (migration 0001) is
 * the one gate. Category and search filters are optional. Search matches
 * name/brand/model case-insensitively. Ordering is stable (created_at, id).
 */
const CATALOG_SELECT = `SELECT id, product_code, name, category_id, brand, model, price, currency, stock, badge, image, description
   FROM products
   WHERE published = true
     AND ($1::text IS NULL OR category_id = $1)
     AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%' OR brand ILIKE '%' || $2 || '%' OR model ILIKE '%' || $2 || '%')`;

export const catalogRepository: CatalogPort = {
  async listPublished(options: CatalogListOptions): Promise<CatalogPage> {
    const page = Math.max(1, Math.trunc(options.page ?? 1) || 1);
    const limit = Math.min(100, Math.max(1, Math.trunc(options.limit ?? 1) || 1));
    const offset = (page - 1) * limit;
    const category = options.category?.trim() || null;
    const search = options.search?.trim() || null;

    const [itemsResult, countResult] = await Promise.all([
      query<ProductDbRow>(`${CATALOG_SELECT} ORDER BY created_at ASC, id ASC LIMIT $3 OFFSET $4`, [
        category,
        search,
        limit,
        offset
      ]),
      query<{ total: number }>(
        `SELECT count(*)::int AS total FROM products WHERE published = true
           AND ($1::text IS NULL OR category_id = $1)
           AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%' OR brand ILIKE '%' || $2 || '%' OR model ILIKE '%' || $2 || '%')`,
        [category, search]
      )
    ]);

    const total = countResult.rows[0].total;
    return {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      items: itemsResult.rows.map(mapProduct)
    };
  },

  async getPublishedById(id: string): Promise<CatalogItem | null> {
    const { rows } = await query<ProductDbRow>(
      `${CATALOG_SELECT} AND id = $3 LIMIT 1`,
      [null, null, id]
    );
    return rows[0] !== undefined ? mapProduct(rows[0]) : null;
  }
};

export const checkoutRepository: CheckoutSessionsPort = {
  async create(input: {
    id: string;
    userId: string;
    orderId: string;
    paymentMethodId?: string | null;
    expiresAt: Date;
  }): Promise<CheckoutSessionRow> {
    const { rows } = await query<{
      id: string;
      user_id: string;
      order_id: string;
      payment_method_id: string | null;
      status: string;
      created_at: Date;
      expires_at: Date;
    }>(
      `INSERT INTO checkout_sessions (id, user_id, order_id, payment_method_id, status, expires_at)
       VALUES ($1, $2, $3, $4, 'pending', $5)
       RETURNING *`,
      [input.id, input.userId, input.orderId, input.paymentMethodId ?? null, input.expiresAt]
    );
    const row = rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      orderId: row.order_id,
      paymentMethodId: row.payment_method_id,
      status: row.status,
      createdAt: row.created_at,
      expiresAt: row.expires_at
    };
  }
};