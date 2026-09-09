/**
 * Venta repository port (domain slice, change `clean-arch-domain`).
 *
 * One interface for the `Venta` root; `VentaLine`, `VentaPayment`, and
 * `CheckoutSession` children travel via the root only. Zero implementations
 * in `domain/`.
 */
import type { Venta } from "./venta.js";

export interface VentaRepository {
  findById(id: string): Promise<Venta | null>;
  save(venta: Venta): Promise<void>;
}
