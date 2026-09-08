/**
 * Postgres reports repository (issue #164) — read-only aggregate SQL.
 *
 * Every query binds values as params (dates as `$n::date`, never
 * interpolated) and mirrors the server-side sources of truth used by the
 * writers:
 *  - sales totals come from `beim_receipts.quote_total` (the server-computed
 *    price x quantity total persisted by sales-batch), excluding `Cancelado`
 *    rows (annul keeps `quote_total` but zeroes the journal via reversals);
 *  - payment-method splits come from `gestion_payment_movements` (one row per
 *    payment, negatives are annul reversals, so sums net to zero);
 *  - stock values come from `products.stock x products.price`;
 *  - cash movement nets come from `audit_logs` (`cash.movement` details);
 *  - top products UNION `beim_receipt_parts` (counter sales) with
 *    `order_items` (webshop orders), excluding cancelled documents on both
 *    sides.
 */
import { query } from "../../../config/db.js";

export interface DayPoint {
  date: string;
  total: number;
  count: number;
}

export interface MethodSplit {
  method: string;
  total: number;
  count: number;
}

export interface StockValuationItem {
  productId: string;
  name: string;
  stock: number;
  price: number;
  minStock: number;
  valuation: number;
  lowStock: boolean;
}

export interface ClosedCashSession {
  id: string;
  businessDate: string;
  openingAmount: number;
  expectedAmount: number;
  countedAmount: number | null;
  difference: number;
}

export interface CashMovementNet {
  type: string;
  total: number;
  count: number;
}

export interface TopProductRow {
  productId: string;
  productName: string;
  quantity: number;
  revenue: number;
}

export const reportsRepository = {
  /** Non-cancelled receipts in range: ticket count + sum of server totals. */
  async salesTotals(range: { from: string; to: string }): Promise<{ ticketCount: number; total: number }> {
    const { rows } = await query<{ ticketCount: string; total: string }>(
      `SELECT count(*)::text AS "ticketCount", COALESCE(SUM(quote_total), 0)::text AS total
       FROM beim_receipts
       WHERE created_at::date >= $1::date
         AND created_at::date <= $2::date
         AND repair_status <> 'Cancelado'`,
      [range.from, range.to]
    );
    return { ticketCount: Number(rows[0].ticketCount), total: Number(rows[0].total) };
  },

  /** Daily series with zero-filled days (generate_series drives the range). */
  async salesByDay(range: { from: string; to: string }): Promise<DayPoint[]> {
    const { rows } = await query<{ date: string; total: string; count: string }>(
      `SELECT to_char(day, 'YYYY-MM-DD') AS date,
              COALESCE(SUM(r.quote_total), 0)::text AS total,
              count(r.id)::text AS count
       FROM generate_series($1::date, $2::date, '1 day') AS day
       LEFT JOIN beim_receipts r
         ON r.created_at::date = day
        AND r.repair_status <> 'Cancelado'
       GROUP BY day
       ORDER BY day`,
      [range.from, range.to]
    );
    return rows.map((row) => ({ date: row.date, total: Number(row.total), count: Number(row.count) }));
  },

  /** Payment-method split from the movements journal (reversals net out). */
  async salesByMethod(range: { from: string; to: string }): Promise<MethodSplit[]> {
    const { rows } = await query<{ method: string; total: string; count: string }>(
      `SELECT method, COALESCE(SUM(amount), 0)::text AS total, count(*)::text AS count
       FROM gestion_payment_movements
       WHERE business_date >= $1::date
         AND business_date <= $2::date
       GROUP BY method
       ORDER BY SUM(amount) DESC, method ASC`,
      [range.from, range.to]
    );
    return rows.map((row) => ({ method: row.method, total: Number(row.total), count: Number(row.count) }));
  },

  /** Per-product stock valuation + grand total (no date filter: snapshot). */
  async stockValuation(): Promise<{ items: StockValuationItem[]; totalValuation: number }> {
    const { rows } = await query<{
      productId: string;
      name: string;
      stock: number;
      price: string;
      minStock: number;
      valuation: string;
      lowStock: boolean;
    }>(
      `SELECT id AS "productId", name, stock, price::text AS price, min_stock AS "minStock",
              (stock * price)::text AS valuation, (stock <= min_stock) AS "lowStock"
       FROM products
       ORDER BY (stock * price) DESC, id ASC`
    );
    const items = rows.map((row) => ({
      productId: row.productId,
      name: row.name,
      stock: row.stock,
      price: Number(row.price),
      minStock: row.minStock,
      valuation: Number(row.valuation),
      lowStock: row.lowStock
    }));
    return { items, totalValuation: items.reduce((sum, item) => sum + item.valuation, 0) };
  },

  /** Cash-movement nets per type from the audit journal in range. */
  async cashMovementNets(range: { from: string; to: string }): Promise<CashMovementNet[]> {
    const { rows } = await query<{ type: string; total: string; count: string }>(
      `SELECT details->>'type' AS type,
              COALESCE(SUM((details->>'amount')::numeric), 0)::text AS total,
              count(*)::text AS count
       FROM audit_logs
       WHERE action = 'cash.movement'
         AND created_at::date >= $1::date
         AND created_at::date <= $2::date
       GROUP BY details->>'type'
       ORDER BY details->>'type' ASC`,
      [range.from, range.to]
    );
    return rows.map((row) => ({ type: row.type, total: Number(row.total), count: Number(row.count) }));
  },

  /** Closed cash sessions in range (business_date), newest first. */
  async closedCashSessions(range: { from: string; to: string }): Promise<ClosedCashSession[]> {
    const { rows } = await query<{
      id: string;
      businessDate: string;
      openingAmount: string;
      expectedAmount: string;
      countedAmount: string | null;
      difference: string;
    }>(
      `SELECT id, business_date::text AS "businessDate",
              opening_amount::text AS "openingAmount", expected_amount::text AS "expectedAmount",
              counted_amount::text AS "countedAmount", difference::text AS difference
       FROM gestion_cash_sessions
       WHERE business_date >= $1::date
         AND business_date <= $2::date
         AND status = 'closed'
       ORDER BY business_date DESC, opened_at DESC`,
      [range.from, range.to]
    );
    return rows.map((row) => ({
      id: row.id,
      businessDate: row.businessDate,
      openingAmount: Number(row.openingAmount),
      expectedAmount: Number(row.expectedAmount),
      countedAmount: row.countedAmount === null ? null : Number(row.countedAmount),
      difference: Number(row.difference)
    }));
  },

  /**
   * Top products over counter sales + webshop orders in range, ordered by
   * quantity (ties: revenue desc, product id asc). Cancelled documents on
   * either side are excluded.
   */
  async topByQuantity(
    range: { from: string; to: string },
    limit: number
  ): Promise<TopProductRow[]> {
    const { rows } = await query<{ productId: string; productName: string; quantity: string; revenue: string }>(
      `WITH sales AS (
         SELECT bp.product_id AS product_id,
                COALESCE(prod.name, bp.product_id) AS product_name,
                bp.quantity AS qty, bp.unit_price AS unit_price
         FROM beim_receipt_parts bp
         JOIN beim_receipts r ON r.id = bp.receipt_id
         LEFT JOIN products prod ON prod.id = bp.product_id
         WHERE r.created_at::date >= $1::date
           AND r.created_at::date <= $2::date
           AND r.repair_status <> 'Cancelado'
         UNION ALL
         SELECT oi.product_id, COALESCE(oi.product_name, oi.product_id),
                oi.quantity, oi.unit_price
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE o.created_at::date >= $1::date
           AND o.created_at::date <= $2::date
           AND o.status <> 'Cancelado'
       )
       SELECT product_id AS "productId", product_name AS "productName",
              SUM(qty)::text AS quantity, SUM(qty * unit_price)::text AS revenue
       FROM sales
       GROUP BY product_id, product_name
       ORDER BY SUM(qty) DESC, SUM(qty * unit_price) DESC, product_id ASC
       LIMIT $3`,
      [range.from, range.to, limit]
    );
    return rows.map((row) => ({
      productId: row.productId,
      productName: row.productName,
      quantity: Number(row.quantity),
      revenue: Number(row.revenue)
    }));
  },

  /** Same combined set ordered by revenue (ties: quantity desc, id asc). */
  async topByRevenue(
    range: { from: string; to: string },
    limit: number
  ): Promise<TopProductRow[]> {
    const { rows } = await query<{ productId: string; productName: string; quantity: string; revenue: string }>(
      `WITH sales AS (
         SELECT bp.product_id AS product_id,
                COALESCE(prod.name, bp.product_id) AS product_name,
                bp.quantity AS qty, bp.unit_price AS unit_price
         FROM beim_receipt_parts bp
         JOIN beim_receipts r ON r.id = bp.receipt_id
         LEFT JOIN products prod ON prod.id = bp.product_id
         WHERE r.created_at::date >= $1::date
           AND r.created_at::date <= $2::date
           AND r.repair_status <> 'Cancelado'
         UNION ALL
         SELECT oi.product_id, COALESCE(oi.product_name, oi.product_id),
                oi.quantity, oi.unit_price
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE o.created_at::date >= $1::date
           AND o.created_at::date <= $2::date
           AND o.status <> 'Cancelado'
       )
       SELECT product_id AS "productId", product_name AS "productName",
              SUM(qty)::text AS quantity, SUM(qty * unit_price)::text AS revenue
       FROM sales
       GROUP BY product_id, product_name
       ORDER BY SUM(qty * unit_price) DESC, SUM(qty) DESC, product_id ASC
       LIMIT $3`,
      [range.from, range.to, limit]
    );
    return rows.map((row) => ({
      productId: row.productId,
      productName: row.productName,
      quantity: Number(row.quantity),
      revenue: Number(row.revenue)
    }));
  },

  /** Ticket counts per repair status (zero-fill happens in the service). */
  async repairsCountByStatus(): Promise<Array<{ status: string; count: number }>> {
    const { rows } = await query<{ status: string; count: string }>(
      `SELECT repair_status AS status, count(*)::text AS count
       FROM beim_receipts
       GROUP BY repair_status
       ORDER BY repair_status ASC`
    );
    return rows.map((row) => ({ status: row.status, count: Number(row.count) }));
  }
};
