/**
 * Pago aggregate (domain slice, change `clean-arch-domain` Phase 6).
 *
 * Provider preference projection over `orders` (`domain-entities.md`
 * v3 §7): every call mints a FRESH preference id and overwrites the stored
 * one; the sale movement itself happens only via the webhook path
 * (`webhook-event.ts` + `venta.markPaidVenta`). Amount/currency are a read
 * reference of the priced sale, never decided here. Immutable values;
 * every behavior returns a new copy. No DDL/SQL here.
 */
import { ValidationError } from "../shared/errors.js";
import type { Money } from "../shared/types.js";

/** Provider preference projection for an owned pending sale. */
export interface Pago {
  readonly orderId: string;
  readonly preferenceId: string | null;
  readonly paymentId: string | null;
  readonly paidAt: Date | null;
  readonly total: Money;
}

/** Minimal priced-sale view `mint` needs; amount/currency are read-only refs. */
export interface MintableVenta {
  readonly id: string;
  readonly total: Money | null;
}

/**
 * Mints a fresh preference for a priced sale, overwriting any stored id.
 * Persistence overwrite is the repository `save` semantics; this function
 * always returns the new projection with payment linkage cleared.
 */
export function mintPago(venta: MintableVenta, preferenceId: string): Pago {
  if (venta.id.trim() === "") {
    throw new ValidationError("Pago inválido: orderId no puede estar vacío", {});
  }
  if (venta.total === null) {
    throw new ValidationError("Pago inválido: la venta requiere precio server-side previo", {
      orderId: venta.id
    });
  }
  if (preferenceId.trim() === "") {
    throw new ValidationError("Pago inválido: preferenceId no puede estar vacío", {});
  }
  return {
    orderId: venta.id,
    preferenceId,
    paymentId: null,
    paidAt: null,
    total: venta.total
  };
}
