import type { TxClient as DriverClient } from "../../db/withTransaction.js";
import type { TxClient } from "../../domain/shared/ports.js";
import type { Pago } from "../../domain/pago/pago.js";
import type { WebhookEvent } from "../../domain/pago/webhook-event.js";
import type {
  PaymentPagoStore,
  PaymentWebhookStore
} from "../../application/payments/ports.js";
import { toDomainWebhookEvent, type WebhookEventTableRow } from "./pg-pago.mapper.js";

/**
 * Pago/Webhook persistence (slice 3.3, change `clean-arch-infrastructure`).
 *
 * Driven adapters behind `PaymentPagoStore`/`PaymentWebhookStore`.
 * Preference overwrite reuses the legacy
 * `modules/webshop/repositories/pg-payments.ts` setPreferenceId UPDATE
 * byte-identical. The ledger reuses claimEvent (INSERT `ON CONFLICT DO
 * NOTHING`: the first insert wins, a raced redelivery changes nothing) and
 * markEvent (UPDATE status + order link) byte-identical; the event outcome
 * discriminates claim (`received`) from advance (any other stored outcome),
 * mirroring the application ingest→commit flow. `deduped` replays never
 * reach the ledger — saving one throws instead of overwriting the first
 * outcome. Only approved deliveries move the sale and oversell keeps it
 * paid (`paid_oversell` + `stockCommitted=false`); both decisions live in
 * the domain (`commitPaidVenta`), the paid flip on `orders` itself belongs
 * to the pending Venta adapter (slice 3.1). Driver errors propagate
 * untouched for the edge `toAppError` mapping.
 */
const SAVE_PREFERENCE_SQL = "UPDATE orders SET mp_preference_id = $2 WHERE id = $1";

const FIND_BY_KEY_SQL = `SELECT provider, event_id, order_id, status, received_at
         FROM webhook_events WHERE provider = $1 AND event_id = $2`;

const CLAIM_SQL = `INSERT INTO webhook_events (provider, event_id, status)
         VALUES ($1, $2, 'received')
         ON CONFLICT DO NOTHING`;

const ADVANCE_SQL = `UPDATE webhook_events SET status = $3, order_id = $4
         WHERE provider = $1 AND event_id = $2`;

/**
 * Bridges the opaque domain `TxClient` to the driver client (`ports.ts`:
 * adapters bridge the real driver here). Fail-closed: non-query handles
 * throw instead of touching the wrong connection.
 */
function driverOf(tx: TxClient): DriverClient {
  const candidate = tx as unknown as { query?: unknown };
  if (typeof candidate.query !== "function") {
    throw new Error("PgPagoAdapter requires a pg TxClient");
  }
  return tx as unknown as DriverClient;
}

export class PgPagoAdapter implements PaymentPagoStore {
  async save(tx: TxClient, pago: Pago): Promise<void> {
    await driverOf(tx).query(SAVE_PREFERENCE_SQL, [pago.orderId, pago.preferenceId]);
  }
}

export class PgWebhookAdapter implements PaymentWebhookStore {
  async findByKey(tx: TxClient, provider: string, eventId: string): Promise<WebhookEvent | null> {
    const { rows } = await driverOf(tx).query<WebhookEventTableRow>(FIND_BY_KEY_SQL, [provider, eventId]);
    if (rows[0] === undefined) return null;
    return toDomainWebhookEvent(rows[0]);
  }

  async save(tx: TxClient, event: WebhookEvent): Promise<void> {
    const client = driverOf(tx);
    if (event.outcome === "received") {
      await client.query(CLAIM_SQL, [event.provider, event.eventId]);
      return;
    }
    if (event.outcome === "deduped") {
      throw new Error("PgWebhookAdapter: deduped replays must not touch the ledger");
    }
    await client.query(ADVANCE_SQL, [event.provider, event.eventId, event.outcome, event.orderId]);
  }
}
