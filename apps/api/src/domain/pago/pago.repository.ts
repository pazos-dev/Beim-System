/**
 * Pago / WebhookEvent repository ports (domain slice, change
 * `clean-arch-domain`).
 *
 * One interface per root (`Pago` preference projection, `WebhookEvent`
 * delivery ledger); `findByKey` backs the `(provider, event_id)`
 * first-insert-wins invariant. Zero implementations in `domain/`.
 */
import type { Pago } from "./pago.js";
import type { WebhookEvent } from "./webhook-event.js";

export interface PagoRepository {
  findByOrderId(orderId: string): Promise<Pago | null>;
  save(pago: Pago): Promise<void>;
}

export interface WebhookEventRepository {
  findByKey(provider: string, eventId: string): Promise<WebhookEvent | null>;
  save(event: WebhookEvent): Promise<void>;
}
