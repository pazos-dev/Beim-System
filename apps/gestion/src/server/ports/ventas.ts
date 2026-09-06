import type { GestionError, Venta } from "../data/schemas";
import type { Result } from "../handlers/result";
import type { PortActor } from "./actor";

/**
 * Audit hook executed by the adapter AFTER persisting the mutation but
 * BEFORE returning success. When the hook fails, the adapter rolls back
 * the persisted step and returns the hook error (AUDIT_FAILURE).
 */
export type VentaAuditHook = () => Promise<Result<undefined, GestionError>>;

export interface VentaRepositoryPort {
  list(actor: PortActor): Promise<Result<Venta[], GestionError>>;
  getById(actor: PortActor, id: string): Promise<Result<Venta, GestionError>>;
  applyCreate(
    actor: PortActor,
    input: { venta: Venta },
    audit: VentaAuditHook
  ): Promise<Result<Venta, GestionError>>;
  applyAnular(
    actor: PortActor,
    input: { venta: Venta },
    audit: VentaAuditHook
  ): Promise<Result<Venta, GestionError>>;
}
