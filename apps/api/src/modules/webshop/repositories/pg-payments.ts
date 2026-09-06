/**
 * Postgres PaymentsPort implementation (issue #84).
 *
 * Owns the webhook_events idempotency ledger and the MercadoPago columns on
 * orders (migration 0002). Every method accepts an optional `client` so the
 * approve path can share ONE transaction with the stock guardDecrement calls
 * (same pattern as gestion sales-batch/annul: no nested transactions).
 */
import { query } from "../../../config/db.js";
import { withTransaction, type TxClient } from "../../../db/withTransaction.js";
import type { PaymentsPort, WebhookEventRow } from "../ports.js";

const PROVIDER = "mercadopago";

async function runOn<T>(client: TxClient | undefined, fn: (tx: TxClient) => Promise<T>): Promise<T> {
  return client !== undefined ? fn(client) : withTransaction(fn);
}

interface WebhookEventDbRow {
  provider: string;
  event_id: string;
  order_id: string | null;
  status: string;
  received_at: Date;
}

export function mapWebhookEventRow(row: WebhookEventDbRow): WebhookEventRow {
  return {
    provider: row.provider,
    eventId: row.event_id,
    orderId: row.order_id,
    status: row.status,
    receivedAt: row.received_at
  };
}

export const paymentsRepository: PaymentsPort = {
  async claimEvent(eventId, client) {
    return runOn(client, async (tx) => {
      const result = await tx.query(
        `INSERT INTO webhook_events (provider, event_id, status)
         VALUES ($1, $2, 'received')
         ON CONFLICT DO NOTHING`,
        [PROVIDER, eventId]
      );
      return (result.rowCount ?? 0) > 0;
    });
  },

  async markEvent(eventId, status, orderId, client) {
    await runOn(client, async (tx) => {
      await tx.query(
        `UPDATE webhook_events SET status = $3, order_id = $4
         WHERE provider = $1 AND event_id = $2`,
        [PROVIDER, eventId, status, orderId ?? null]
      );
    });
  },

  async setPreferenceId(orderId, preferenceId, client) {
    await runOn(client, async (tx) => {
      await tx.query("UPDATE orders SET mp_preference_id = $2 WHERE id = $1", [orderId, preferenceId]);
    });
  },

  async markPaid(orderId, paymentId, client) {
    await runOn(client, async (tx) => {
      await tx.query(
        `UPDATE orders
         SET payment_status = 'Pagado', paid_at = now(), mp_payment_id = $2, stock_committed = true
         WHERE id = $1`,
        [orderId, paymentId]
      );
    });
  },

  async setStockCommitted(orderId, committed, client) {
    await runOn(client, async (tx) => {
      await tx.query("UPDATE orders SET stock_committed = $2 WHERE id = $1", [orderId, committed]);
    });
  }
};

/** Test helper: reads a webhook event row by id (null when unknown). */
export async function getWebhookEvent(eventId: string): Promise<WebhookEventRow | null> {
  const { rows } = await query<WebhookEventDbRow>(
    "SELECT * FROM webhook_events WHERE provider = $1 AND event_id = $2",
    [PROVIDER, eventId]
  );
  const row = rows[0];
  return row === undefined ? null : mapWebhookEventRow(row);
}
