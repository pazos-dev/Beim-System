import type { ZodIssue } from "zod";

import type { Compra, GestionError, MovimientoStock, Producto } from "../data/schemas";
import { AuditRepository, buildAuditEvent } from "../shared/audit";
import type { AuthActor, Role } from "../shared/auth";
import { createGestionError, ERROR_CODES } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";
import type { PortActor } from "../shared/actor";

/**
 * Audit hook executed by the adapter AFTER persisting the mutation but
 * BEFORE returning success. When the hook fails, the adapter rolls back
 * every persisted step and returns the hook error (AUDIT_FAILURE).
 */
export type StockAuditHook = () => Promise<Result<undefined, GestionError>>;

export interface StockActor {
  hasGlobalAccess: boolean;
  id: string;
  role: Role;
}

export function toStockActor(auth: AuthActor): StockActor {
  return {
    hasGlobalAccess: auth.role === "administrador" || auth.role === "administrador_principal",
    id: auth.id,
    role: auth.role
  };
}

export function toPortActor(actor: StockActor): PortActor {
  return { hasGlobalAccess: actor.hasGlobalAccess, id: actor.id };
}

// Shared context for per-operation stock effects (levels, compras, outflow,
// transfer). Operations receive the port plus the audit store and build their
// own hooks through the helpers below, so the facade stays a thin front.
export interface StockEffectDeps {
  readonly audit: AuditRepository;
  readonly port: StockRepositoryPort;
}

export function createAuditHook(
  audit: AuditRepository,
  actorId: string,
  accion: string,
  entidad: string,
  entidadId: string | null,
  detalles: Record<string, unknown>
): StockAuditHook {
  return async () => {
    const appended = await audit.append(
      buildAuditEvent({ actorId, accion, entidad, entidadId, detalles }, "ok")
    );
    if (!appended.ok) return err(appended.error);
    return ok(undefined);
  };
}

export async function reportAuditOutcome<T>(
  audit: AuditRepository,
  actorId: string,
  accion: string,
  entidadId: string | null,
  outcome: Result<T, GestionError>
): Promise<Result<T, GestionError>> {
  const appended = await audit.append(
    buildAuditEvent(
      { actorId, accion, entidad: "stock", entidadId },
      outcome.ok ? "ok" : outcome.error.code
    )
  );
  if (!appended.ok) return err(appended.error);
  return outcome;
}

export function validationError(issues: ZodIssue[]): GestionError {
  return createGestionError(ERROR_CODES.VALIDATION_ERROR, {
    fields: issues.map((issue) => issue.path.join("."))
  });
}

export function forbidden(): GestionError {
  return createGestionError(ERROR_CODES.FORBIDDEN);
}

export function storageError(): GestionError {
  return createGestionError(ERROR_CODES.STORAGE_ERROR);
}

export interface StockRepositoryPort {
  getProducto(actor: PortActor, id: string): Promise<Result<Producto, GestionError>>;
  listMovimientos(
    actor: PortActor,
    productoId?: string
  ): Promise<Result<MovimientoStock[], GestionError>>;
  listProductos(actor: PortActor): Promise<Result<Producto[], GestionError>>;
  listCompras(actor: PortActor): Promise<Result<Compra[], GestionError>>;
  getCompra(actor: PortActor, id: string): Promise<Result<Compra, GestionError>>;
  applyOutflow(
    actor: PortActor,
    input: { movimiento: MovimientoStock; producto: Producto },
    audit: StockAuditHook
  ): Promise<Result<{ movimiento: MovimientoStock; producto: Producto }, GestionError>>;
  applyTransferPair(
    actor: PortActor,
    input: { movimientos: readonly [MovimientoStock, MovimientoStock] },
    audit: StockAuditHook
  ): Promise<Result<{ movimientos: [MovimientoStock, MovimientoStock] }, GestionError>>;
  applyPurchase(
    actor: PortActor,
    input: { compra: Compra; movimiento: MovimientoStock; producto: Producto },
    audit: StockAuditHook
  ): Promise<Result<{ compra: Compra; movimiento: MovimientoStock; producto: Producto }, GestionError>>;
}
