import type { Gasto, GestionError, SesionCaja, Venta } from "../data/schemas";
import type { Result } from "../handlers/result";
import type { PortActor } from "./actor";

/**
 * Audit hook executed by the adapter AFTER persisting the opening but
 * BEFORE returning success. When the hook fails, the adapter rolls back
 * the persisted step and returns the hook error (AUDIT_FAILURE).
 */
export type CajaAuditHook = (persisted: SesionCaja) => Promise<Result<undefined, GestionError>>;

export interface CajaAbrirInput {
  apertura: number;
  fecha: string;
}

export interface CajaMovements {
  gastos: Gasto[];
  ventas: Venta[];
}

export interface CajaRepositoryPort {
  list(actor: PortActor): Promise<Result<SesionCaja[], GestionError>>;
  findAbierta(actor: PortActor): Promise<Result<SesionCaja | null, GestionError>>;
  getById(actor: PortActor, id: string): Promise<Result<SesionCaja, GestionError>>;
  readMovements(actor: PortActor): Promise<Result<CajaMovements, GestionError>>;
  applyAbrir(
    actor: PortActor,
    input: CajaAbrirInput,
    audit: CajaAuditHook
  ): Promise<Result<SesionCaja, GestionError>>;
}
