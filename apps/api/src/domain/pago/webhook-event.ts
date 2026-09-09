/**
 * WebhookEvent aggregate (domain slice, change `clean-arch-domain` Phase 6).
 *
 * Provider delivery ledger (`domain-entities.md` v3 §7): `(provider,
 * event_id)` is first-insert-wins — a duplicate delivery answers `deduped`
 * and leaves the sale untouched. Only an approved delivery moves the sale;
 * oversell keeps the sale paid with `stock_committed=false`. The status flip
 * on the sale itself stays in `venta.markPaidVenta`; `commitPaidVenta`
 * returns the linkage the application layer applies. Route-level answers
 * (200 every business outcome, 403 bad signature, 503 missing secret) live
 * in the HTTP adapter, NOT here. Immutable values. No DDL/SQL here.
 */
import { ConflictError, ValidationError } from "../shared/errors.js";

/** Business outcome of a provider delivery (stored as `webhook_events.status`). */
export type WebhookOutcome =
  | "received"
  | "ignored"
  | "unmapped"
  | "noop"
  | "not_approved"
  | "paid"
  | "paid_oversell"
  | "deduped";

/** Default provider when the delivery carries none. */
export const DEFAULT_PROVIDER = "mercadopago";

/** One provider delivery; `orderId` links on commit. */
export interface WebhookEvent {
  readonly provider: string;
  readonly eventId: string;
  readonly orderId: string | null;
  readonly outcome: WebhookOutcome;
  readonly receivedAt: Date;
}

export interface IngestWebhookEventInput {
  readonly provider: string;
  readonly eventId: string;
  readonly receivedAt: Date;
}

/**
 * First insert wins: a duplicate delivery of an already ingested
 * `(provider, event_id)` answers `deduped` on a copy that keeps the first
 * `receivedAt` — the sale is untouched. Fresh deliveries open as `received`.
 */
export function ingestWebhookEvent(
  existing: WebhookEvent | null,
  input: IngestWebhookEventInput
): WebhookEvent {
  if (input.provider.trim() === "") {
    throw new ValidationError("Webhook inválido: provider no puede estar vacío", {});
  }
  if (input.eventId.trim() === "") {
    throw new ValidationError("Webhook inválido: eventId no puede estar vacío", {});
  }
  if (existing !== null) {
    return { ...existing, outcome: "deduped" };
  }
  return {
    provider: input.provider,
    eventId: input.eventId,
    orderId: null,
    outcome: "received",
    receivedAt: input.receivedAt
  };
}

export interface CommitPaidVentaInput {
  readonly orderId: string;
  readonly approved: boolean;
  readonly oversell: boolean;
  readonly paymentId: string;
  readonly paidAt: Date;
}

/** Sale linkage a commit produces; null when the sale stays untouched. */
export interface CommittedSale {
  readonly orderId: string;
  readonly paymentId: string;
  readonly paidAt: Date;
  readonly stockCommitted: boolean;
}

export interface CommitPaidVentaResult {
  readonly event: WebhookEvent;
  readonly sale: CommittedSale | null;
}

/**
 * Commits a received delivery: approved moves the sale (`paid`, or
 * `paid_oversell` with `stockCommitted=false` when stock ran out);
 * not approved records `not_approved` leaving the sale untouched. A second
 * commit of the same delivery answers 409 keeping the first outcome.
 */
export function commitPaidVenta(
  event: WebhookEvent,
  input: CommitPaidVentaInput
): CommitPaidVentaResult {
  if (event.outcome !== "received") {
    throw new ConflictError("Webhook en conflicto: el evento ya fue procesado", {
      provider: event.provider,
      eventId: event.eventId
    });
  }
  if (input.orderId.trim() === "") {
    throw new ValidationError("Webhook inválido: orderId no puede estar vacío", {});
  }
  if (input.paymentId.trim() === "") {
    throw new ValidationError("Webhook inválido: paymentId no puede estar vacío", {});
  }
  if (!input.approved) {
    return {
      event: { ...event, orderId: input.orderId, outcome: "not_approved" },
      sale: null
    };
  }
  const outcome: WebhookOutcome = input.oversell ? "paid_oversell" : "paid";
  return {
    event: { ...event, orderId: input.orderId, outcome },
    sale: {
      orderId: input.orderId,
      paymentId: input.paymentId,
      paidAt: input.paidAt,
      stockCommitted: !input.oversell
    }
  };
}
