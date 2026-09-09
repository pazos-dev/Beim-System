import type { WebhookEvent, WebhookOutcome } from "../../domain/pago/webhook-event.js";

/**
 * Webhook row mapping (slice 3.3, change `clean-arch-infrastructure`).
 *
 * The ledger vocabulary (`received`, `ignored`, `unmapped`, `noop`,
 * `not_approved`, `paid`, `paid_oversell`) is shared verbatim between the
 * domain and the `webhook_events.status` column — no translation, only a
 * membership check. `deduped` is an application answer, never a stored
 * status: persisting it would overwrite the first outcome. Unknown statuses
 * fail closed.
 */
export interface WebhookEventTableRow {
  provider: string;
  event_id: string;
  order_id: string | null;
  status: string;
  received_at: Date;
}

const STORED_OUTCOMES: ReadonlySet<string> = new Set([
  "received",
  "ignored",
  "unmapped",
  "noop",
  "not_approved",
  "paid",
  "paid_oversell"
]);

function checkOutcome(value: string): WebhookOutcome {
  if (STORED_OUTCOMES.has(value)) return value as WebhookOutcome;
  throw new Error(`PgWebhookAdapter: unknown webhook status "${value}"`);
}

export function toDomainWebhookEvent(row: WebhookEventTableRow): WebhookEvent {
  return {
    provider: row.provider,
    eventId: row.event_id,
    orderId: row.order_id,
    outcome: checkOutcome(row.status),
    receivedAt: row.received_at
  };
}
