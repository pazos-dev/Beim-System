/**
 * Payment handlers (change `clean-arch-application`, Unit 7).
 *
 * Two thin use cases: mint a fresh provider preference for a priced pending
 * `Venta` (`mintPago` overwrite), and ingest one provider delivery then
 * commit it (`ingestWebhookEvent` → `commitPaidVenta` + `markPaidVenta`) in
 * a single `UnitOfWork.run`. First-insert-wins on `(provider, event_id)`:
 * a duplicate replays `deduped` with the sale untouched and zero saves.
 * Oversell keeps the sale paid (`paid_oversell`, `stockCommitted=false`);
 * not-approved stores the event leaving the sale untouched. Invalid
 * signatures throw `AuthError` (403 at the edge), unavailable verification
 * or provider throw `DependencyUnavailableError` (503). Domain errors pass
 * through untouched to the edge `toAppError` mapping.
 */
import {
  AuthError,
  ConflictError,
  NotFoundError,
  ValidationError
} from "../../domain/shared/errors.js";
import { mintPago } from "../../domain/pago/pago.js";
import {
  commitPaidVenta,
  ingestWebhookEvent,
  type WebhookOutcome
} from "../../domain/pago/webhook-event.js";
import { markPaidVenta } from "../../domain/venta/venta.js";
import type { PaymentDeps } from "./ports.js";

export interface MintPreferenceInput {
  readonly orderId: string;
}

export interface HandleWebhookInput {
  readonly provider: string;
  readonly eventId: string;
  readonly rawBody: Uint8Array;
  readonly signature: string;
  readonly orderId: string;
  readonly approved: boolean;
  readonly oversell: boolean;
  readonly paymentId: string;
}

export interface HandleWebhookResult {
  readonly outcome: WebhookOutcome;
  readonly orderId?: string;
}

function ventaNotFound(id: string): NotFoundError {
  return new NotFoundError(`Venta no encontrada: ${id}`);
}

export function makePaymentHandlers(deps: PaymentDeps) {
  const { uow, ventas, pagos, webhooks, gateway, verifier, clock } = deps;

  return {
    async mintPreference(input: MintPreferenceInput) {
      return uow.run(async (tx) => {
        const venta = await ventas.findById(tx, input.orderId);
        if (venta === null) throw ventaNotFound(input.orderId);
        if (venta.status !== "Pendiente") {
          throw new ConflictError("La venta ya no está pendiente de pago");
        }
        if (venta.total === null) {
          throw new ValidationError("Pago inválido: la venta requiere precio server-side previo", {
            orderId: venta.id
          });
        }
        const { preferenceId } = await gateway.createPreference(venta.id, venta.total.amount);
        const pago = mintPago(venta, preferenceId);
        await pagos.save(tx, pago);
        return pago;
      });
    },

    async handleWebhook(input: HandleWebhookInput): Promise<HandleWebhookResult> {
      return uow.run(async (tx) => {
        const valid = verifier.verify(input.rawBody, input.signature);
        if (!valid) throw new AuthError("FORBIDDEN");
        const existing = await webhooks.findByKey(tx, input.provider, input.eventId);
        const ingested = ingestWebhookEvent(existing, {
          provider: input.provider,
          eventId: input.eventId,
          receivedAt: clock.now()
        });
        if (ingested.outcome === "deduped") {
          return { outcome: "deduped", orderId: ingested.orderId ?? undefined };
        }
        const committed = commitPaidVenta(ingested, {
          orderId: input.orderId,
          approved: input.approved,
          oversell: input.oversell,
          paymentId: input.paymentId,
          paidAt: clock.now()
        });
        await webhooks.save(tx, committed.event);
        if (committed.sale === null) {
          return { outcome: committed.event.outcome, orderId: input.orderId };
        }
        const venta = await ventas.findById(tx, committed.sale.orderId);
        if (venta === null) throw ventaNotFound(committed.sale.orderId);
        const paid = markPaidVenta(venta, {
          paymentRef: committed.sale.paymentId,
          paidAt: committed.sale.paidAt
        });
        await ventas.save(tx, paid);
        return { outcome: committed.event.outcome, orderId: committed.sale.orderId };
      });
    }
  };
}
