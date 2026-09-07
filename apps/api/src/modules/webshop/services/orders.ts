/**
 * Orders + checkout services (PR 4) — webshop-api/spec.md "Order then pay".
 *
 * create(): one transaction. For every line the product row is locked
 * (SELECT ... FOR UPDATE) and used for a stock CHECK and server-authoritative
 * pricing; client prices are never trusted (same policy as gestion sales-
 * batch). Stock is checked but NOT decremented — an order reserves nothing
 * (stock_committed=false); payment commits stock via the future webhook.
 * Insufficient stock, unknown or unpublished products, or mixed currencies
 * abort the whole transaction: no order, no items (409/404/422).
 *
 * checkoutService.create(): mints a checkout_sessions row (pending) with a
 * payment URL; payment_status stays 'Pendiente de pago' — the webhook is the
 * only thing that flips it, and it is out of scope for this change.
 */
import { randomUUID } from "node:crypto";
import { withTransaction } from "../../../db/withTransaction.js";
import { ConflictError, InsufficientStockError, NotFoundError, ValidationError } from "../../../errors/taxonomy.js";
import { webshopConfig } from "../config.js";
import type { OrderWithItems } from "../ports.js";
import { checkoutRepository, ordersRepository } from "../repositories/pg-orders.js";

export interface OrderLineInput {
  productId: string;
  quantity: number;
}

export interface CreateOrderInput {
  customer: string;
  email?: string | null;
  phone?: string | null;
  ci?: string | null;
  rut?: string | null;
  address?: string | null;
  shipping?: string | null;
  comments?: string | null;
  items: OrderLineInput[];
}

interface PricedLine {
  productId: string;
  productCode: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  currency: string;
}

const ORDER_PRODUCT_SQL = `SELECT id, name, product_code, price, currency, stock
   FROM products
   WHERE id = $1 AND published = true
   FOR UPDATE`;

export const ordersService = {
  /** Creates an unpaid order + items atomically with a stock check and
   * server-side pricing. Never decrements stock (see module doc). */
  async create(userId: string, input: CreateOrderInput): Promise<OrderWithItems> {
    return withTransaction(async (tx) => {
      const lines: PricedLine[] = [];
      let currency: string | null = null;

      for (const item of input.items) {
        const { rows } = await tx.query<{
          id: string;
          name: string;
          product_code: number;
          price: string;
          currency: string;
          stock: number;
        }>(ORDER_PRODUCT_SQL, [item.productId]);

        const product = rows[0];
        if (product === undefined) throw new NotFoundError(`Producto no encontrado: ${item.productId}`);
        if (product.stock < item.quantity) {
          throw new InsufficientStockError(undefined, { currentStock: product.stock });
        }
        if (currency === null) {
          currency = product.currency;
        } else if (currency !== product.currency) {
          throw new ValidationError("Moneda inconsistente entre productos del carrito");
        }

        lines.push({
          productId: product.id,
          productCode: product.product_code,
          productName: product.name,
          quantity: item.quantity,
          unitPrice: Number(product.price),
          currency: product.currency
        });
      }

      const total = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
      const result = await ordersRepository.insertOrder(
        {
          customer: input.customer,
          email: input.email ?? null,
          phone: input.phone ?? null,
          ci: input.ci ?? null,
          rut: input.rut ?? null,
          address: input.address ?? null,
          shipping: input.shipping ?? null,
          comments: input.comments ?? null,
          total,
          currency: currency ?? "UYU",
          userId
        },
        lines.map((line) => ({
          productId: line.productId,
          productCode: line.productCode,
          productName: line.productName,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          currency: line.currency
        })),
        tx
      );

      return result;
    });
  },

  listMine(
    userId: string,
    options: { page?: number; limit?: number }
  ): ReturnType<typeof ordersRepository.listByUser> {
    return ordersRepository.listByUser(userId, options);
  },

  getMine(userId: string, orderId: string): Promise<OrderWithItems | null> {
    return ordersRepository.getByUser(userId, orderId);
  },

  /**
   * Cancels an owned order (issue #89) — customer-initiated.
   *
   * Only pending orders can be cancelled: a paid order (or any other
   * non-pending, non-cancelled payment state) conflicts (409). Cancelling an
   * already-cancelled order is a no-op returning the row as-is (idempotent).
   *
   * The flip sets BOTH status and payment_status to 'Cancelado' in one
   * transaction and marks the order's pending checkout_sessions 'cancelled'.
   * Both fields matter: with payment_status='Cancelado' the existing gates
   * already do the right thing untouched — late approved webhooks noop,
   * fresh preferences 409, fresh checkout sessions 409.
   *
   * No automatic refund (phase 2): money movement, if any, is manual.
   */
  async cancel(userId: string, orderId: string): Promise<OrderWithItems> {
    const owned = await ordersRepository.getByUser(userId, orderId);
    if (owned === null) throw new NotFoundError(`Orden no encontrada: ${orderId}`);
    if (owned.order.status === "Cancelado") return owned;
    if (owned.order.paymentStatus !== "Pendiente de pago" && owned.order.paymentStatus !== "Cancelado") {
      throw new ConflictError("La orden ya no se puede cancelar");
    }
    await withTransaction(async (tx) => {
      await tx.query("UPDATE orders SET status = 'Cancelado', payment_status = 'Cancelado' WHERE id = $1", [
        orderId
      ]);
      await tx.query(
        "UPDATE checkout_sessions SET status = 'cancelled' WHERE order_id = $1 AND status = 'pending'",
        [orderId]
      );
    });
    const cancelled = await ordersRepository.getByUser(userId, orderId);
    // The row cannot vanish between the UPDATE and this read (same owner
    // scope, no delete path for orders), but fail loud instead of deref'ing.
    if (cancelled === null) throw new NotFoundError(`Orden no encontrada: ${orderId}`);
    return cancelled;
  }
};

export interface CheckoutSessionResult {
  id: string;
  url: string;
  status: string;
  orderId: string;
  expiresAt: Date;
}

export const checkoutService = {
  /** Mints a pending checkout session for an owned, unpaid order. One
   * pending session at a time: a second mint conflicts (409) until the
   * first resolves (paid via webhook) or expires. */
  async create(userId: string, orderId: string, paymentMethodId?: string | null): Promise<CheckoutSessionResult> {
    return withTransaction(async (tx) => {
      const { rows } = await tx.query<{ payment_status: string }>(
        "SELECT payment_status FROM orders WHERE id = $1 AND user_id = $2",
        [orderId, userId]
      );
      const order = rows[0];
      if (order === undefined) throw new NotFoundError(`Orden no encontrada: ${orderId}`);
      if (order.payment_status !== "Pendiente de pago") {
        throw new ConflictError("La orden ya no está pendiente de pago");
      }
      const pending = await tx.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM checkout_sessions WHERE order_id = $1 AND status = 'pending'",
        [orderId]
      );
      if (Number(pending.rows[0].n) > 0) {
        throw new ConflictError("Ya existe una sesión de checkout pendiente para esta orden");
      }

      const id = randomUUID();
      const expiresAt = new Date(Date.now() + webshopConfig().checkoutSessionTtlMs);
      await checkoutRepository.create({ id, userId, orderId, paymentMethodId: paymentMethodId ?? null, expiresAt });

      const url = `${webshopConfig().checkoutBaseUrl}/checkout/${id}`;
      return { id, url, status: "pending", orderId, expiresAt };
    });
  }
};