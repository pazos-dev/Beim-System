import { createMoney, createProductId } from "../../domain/shared/types.js";
import type { Venta, VentaStatus } from "../../domain/venta/venta.js";

/**
 * Venta rows (slice 3.1, change `clean-arch-infrastructure`).
 *
 * Read projection over the legacy webshop tables (`orders`, `order_items`,
 * `checkout_sessions`): every SELECT/INSERT/UPDATE in the adapter is copied
 * byte-identical from `modules/webshop/repositories/pg-orders.ts`,
 * `pg-checkout-sessions.ts` and `pg-payments.ts`. Channel reads back
 * `webshop` (legacy orders are webshop-only; counter batches persist via
 * receipts, never here); line allocations are runtime-only (`[]` on read);
 * per-method `payments` have no webshop column and read back `[]`.
 */

/** Legacy `orders` row fragment the adapter reads (`SELECT *` passthrough). */
export interface VentaOrderRow {
  id: string;
  customer: string;
  email: string | null;
  phone?: string | null;
  ci?: string | null;
  rut?: string | null;
  address?: string | null;
  shipping?: string | null;
  comments?: string | null;
  user_id?: string | null;
  total: string | number;
  currency: string;
  status: string;
  payment_status: string;
  stock_committed: boolean;
  mp_preference_id: string | null;
  mp_payment_id: string | null;
  paid_at: Date | string | null;
  created_at: Date | string;
}

/** Legacy `order_items` row (`SELECT *` passthrough). */
export interface VentaItemRow {
  id: number;
  order_id: string;
  product_id: string | null;
  product_code: number | null;
  product_name: string;
  quantity: number;
  unit_price: string | number;
  currency: string;
}

/** Pending `checkout_sessions` row feeding `Venta.checkoutSession`. */
export interface VentaSessionRow {
  id: string;
  order_id: string;
  status: string;
  payment_method_id?: string | null;
  created_at: Date | string;
  expires_at: Date | string;
}

function toStatus(order: VentaOrderRow): VentaStatus {
  if (order.payment_status === "Pagado") return "Pagada";
  if (order.status === "Cancelado" || order.payment_status === "Cancelado") return "Cancelada";
  return "Pendiente";
}

/** Order + items + pending session → `Venta` (prices as `Money`, never text). */
export function toVenta(
  order: VentaOrderRow,
  items: readonly VentaItemRow[],
  session: VentaSessionRow | null
): Venta {
  return {
    id: order.id,
    channel: "webshop",
    status: toStatus(order),
    lines: items.map((item) => ({
      productId: item.product_id === null ? null : createProductId(item.product_id),
      quantity: item.quantity,
      unitPrice: createMoney(Number(item.unit_price), item.currency),
      allocations: []
    })),
    payments: [],
    checkoutSession:
      session === null
        ? null
        : {
            id: session.id,
            ventaId: session.order_id,
            status: "pending",
            createdAt: new Date(session.created_at),
            expiresAt: new Date(session.expires_at),
            paymentMethodId: session.payment_method_id ?? null
          },
    stockCommitted: order.stock_committed,
    total: createMoney(Number(order.total), order.currency),
    paymentRef: order.mp_payment_id ?? null,
    paidAt: order.paid_at == null ? null : new Date(order.paid_at),
    customer: order.customer,
    email: order.email,
    phone: order.phone ?? null,
    ci: order.ci ?? null,
    rut: order.rut ?? null,
    address: order.address ?? null,
    shipping: order.shipping ?? null,
    comments: order.comments ?? null,
    userId: order.user_id ?? null,
    // Webshop rows carry no mostrador intake metadata (counter batches
    // persist via receipts, never here): read back null, never invented.
    clientName: null,
    clientId: null,
    deviceBrand: null,
    deviceModel: null,
    imeiSerial: null,
    reportedIssue: null,
    services: null
  };
}
