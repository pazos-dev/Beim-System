import type { GestionError, Venta } from "../data/schemas";
import type { Result } from "../handlers/result";
import type { PortActor } from "./actor";

/**
 * Audit hook executed by the adapter AFTER persisting the mutation but
 * BEFORE returning success. It receives the persisted sale so the use case
 * can record the entity id. When the hook fails, the adapter rolls back
 * the persisted step and returns the hook error (AUDIT_FAILURE).
 */
export type VentaAuditHook = (persisted: Venta) => Promise<Result<undefined, GestionError>>;

export interface VentaPricedItem {
  cantidad: number;
  precio: number;
  productoId: string;
}

export interface VentaCreateDraft {
  descuento?: { motivo: string; monto: number };
  items: VentaPricedItem[];
  numero?: string;
  ordenId?: string;
  pagos: Array<{ metodo: Venta["pagos"][number]["metodo"]; monto: number }>;
  total: number;
}

export interface VentaCreateEffects {
  deltas: ReadonlyArray<{ productoId: string; cantidad: number }>;
  draft: VentaCreateDraft;
}

export type VentaCreateInput = { venta: Venta } | VentaCreateEffects;

export type VentaAnularInput = { venta: Venta } | { venta: Venta; motivo: string };

export interface VentaRepositoryPort {
  list(actor: PortActor): Promise<Result<Venta[], GestionError>>;
  getById(actor: PortActor, id: string): Promise<Result<Venta, GestionError>>;
  applyCreate(
    actor: PortActor,
    input: VentaCreateInput,
    audit: VentaAuditHook
  ): Promise<Result<Venta, GestionError>>;
  applyAnular(
    actor: PortActor,
    input: VentaAnularInput,
    audit: VentaAuditHook
  ): Promise<Result<Venta, GestionError>>;
}
