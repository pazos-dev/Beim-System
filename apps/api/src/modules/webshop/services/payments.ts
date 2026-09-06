/**
 * MercadoPago payments service (issue #84) — "Order then pay" completion.
 *
 * createPreferenceForOrder(): mints a NEW checkout preference for an owned,
 * still-pending order (always a fresh preference — it overwrites
 * mp_preference_id) and returns the payer redirect (init_point).
 *
 * handlePaymentNotification(): processes an IPN delivery. The route answers
 * 200 for every business outcome (received/ignored/unmapped/noop/
 * not_approved/paid) so MercadoPago stops retrying; only auth (403),
 * missing configuration or MP outage (503), and malformed bodies (422 at
 * the route) fail loud. MP status vocabulary is deliberately NOT mapped
 * 1:1 — only 'approved' moves the order; anything else leaves it intact.
 */
import { withTransaction } from "../../../db/withTransaction.js";
import {
  AuthError,
  ConflictError,
  DependencyUnavailableError,
  InsufficientStockError,
  NotFoundError
} from "../../../errors/taxonomy.js";
import { stockRepository } from "../../gestion/repositories/pg-stock.js";
import { webshopConfig } from "../config.js";
import { getOrderWithItems, ordersRepository } from "../repositories/pg-orders.js";
import { paymentsRepository } from "../repositories/pg-payments.js";
import { createPreference, getPayment, verifyWebhookSignature } from "./mercadopago.js";

const PENDING_STATUS = "Pendiente de pago";

export interface PreferenceResult {
  preferenceId: string;
  initPoint: string;
}

export type PaymentNotificationOutcome =
  | "deduped"
  | "ignored"
  | "unmapped"
  | "noop"
  | "not_approved"
  | "paid"
  | "paid_oversell";

export interface PaymentNotificationResult {
  outcome: PaymentNotificationOutcome;
  orderId?: string;
}

export interface PaymentNotificationInput {
  notificationId: string;
  type: string;
  dataId: string;
  xSignature: string;
  xRequestId?: string;
}

export const paymentsService = {
  /** Mints a fresh MP preference for an owned, pending order. */
  async createPreferenceForOrder(userId: string, orderId: string): Promise<PreferenceResult> {
    const owned = await ordersRepository.getByUser(userId, orderId);
    if (owned === null) throw new NotFoundError(`Orden no encontrada: ${orderId}`);
    if (owned.order.paymentStatus !== PENDING_STATUS) {
      throw new ConflictError("La orden ya no está pendiente de pago");
    }
    const config = webshopConfig();
    if (config.mpAccessToken === undefined) throw new DependencyUnavailableError();
    const preference = await createPreference(config.mpAccessToken, {
      items: owned.items.map((line) => ({
        title: line.productName,
        quantity: line.quantity,
        unit_price: line.unitPrice,
        currency_id: line.currency
      })),
      externalReference: orderId,
      notificationUrl: config.mpNotificationUrl
    });
    await paymentsRepository.setPreferenceId(orderId, preference.id);
    return { preferenceId: preference.id, initPoint: preference.init_point };
  },

  /** Processes one MercadoPago IPN delivery (always 200-safe outcomes). */
  async handlePaymentNotification(input: PaymentNotificationInput): Promise<PaymentNotificationResult> {
    const config = webshopConfig();
    if (config.mpWebhookSecret === undefined) throw new DependencyUnavailableError();
    const valid = verifyWebhookSignature({
      dataId: input.dataId,
      xSignature: input.xSignature,
      xRequestId: input.xRequestId,
      secret: config.mpWebhookSecret
    });
    if (!valid) throw new AuthError("FORBIDDEN");
    // The access token is checked BEFORE claiming the event: a 503 must let
    // MP retry later, but a claimed event would turn that retry into a
    // deduped no-op and the payment would never be processed.
    if (config.mpAccessToken === undefined) throw new DependencyUnavailableError();

    const claimed = await paymentsRepository.claimEvent(input.notificationId);
    if (!claimed) return { outcome: "deduped" };

    if (input.type !== "payment") {
      await paymentsRepository.markEvent(input.notificationId, "ignored");
      return { outcome: "ignored" };
    }

    const payment = await getPayment(config.mpAccessToken, input.dataId);
    const orderId = payment.external_reference;
    // Log only id + status (+ the attempted order reference): the MP payment
    // payload may carry payer PII that must never reach the logs.
    if (orderId === null) {
      await paymentsRepository.markEvent(input.notificationId, "unmapped");
      console.warn(`[payments] unmapped payment id=${String(payment.id)} status=${payment.status}`);
      return { outcome: "unmapped" };
    }
    const found = await getOrderWithItems(orderId);
    if (found === null) {
      // No order link: order_id is a FK to orders(id), so a phantom
      // external_reference cannot be stored — the log keeps the reference.
      await paymentsRepository.markEvent(input.notificationId, "unmapped");
      console.warn(`[payments] unmapped payment id=${String(payment.id)} status=${payment.status} orderId=${orderId}`);
      return { outcome: "unmapped" };
    }

    // Not pending covers paid orders AND any future cancelled states (there
    // is no order cancellation yet — issue #89 — so this stays future-proof).
    if (found.order.paymentStatus !== PENDING_STATUS) {
      await paymentsRepository.markEvent(input.notificationId, "noop", orderId);
      return { outcome: "noop", orderId };
    }

    if (payment.status !== "approved") {
      await paymentsRepository.markEvent(input.notificationId, "not_approved", orderId);
      return { outcome: "not_approved", orderId };
    }

    let oversell = false;
    await withTransaction(async (tx) => {
      await paymentsRepository.markPaid(orderId, String(payment.id), tx);
      for (const line of found.items) {
        // Lines without a product (e.g. manual/described items) never touch stock.
        if (line.productId === null) continue;
        try {
          // Same lock-then-guard contract as gestion sales-batch: serialized
          // on the product row, 409 when the checked stock is insufficient.
          await stockRepository.guardDecrement(line.productId, line.quantity, tx);
        } catch (err) {
          if (!(err instanceof InsufficientStockError)) throw err;
          // Oversell: the payment already happened, so the order STAYS paid
          // with stock_committed=false and the rest of the lines still commit.
          oversell = true;
          await paymentsRepository.setStockCommitted(orderId, false, tx);
          console.warn(`[payments] oversell orderId=${orderId} productId=${line.productId}`);
        }
      }
      await paymentsRepository.markEvent(
        input.notificationId,
        oversell ? "paid_oversell" : "paid",
        orderId,
        tx
      );
    });
    return oversell ? { outcome: "paid_oversell", orderId } : { outcome: "paid", orderId };
  }
};
