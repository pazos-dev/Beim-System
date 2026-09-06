import type { Compra, GestionError, MovimientoStock, Producto } from "../data/schemas";
import type { Result } from "../handlers/result";
import type { PortActor } from "./actor";

/**
 * Audit hook executed by the adapter AFTER persisting the mutation but
 * BEFORE returning success. When the hook fails, the adapter rolls back
 * every persisted step and returns the hook error (AUDIT_FAILURE).
 */
export type StockAuditHook = () => Promise<Result<undefined, GestionError>>;

export interface StockRepositoryPort {
  getProducto(actor: PortActor, id: string): Promise<Result<Producto, GestionError>>;
  listMovimientos(
    actor: PortActor,
    productoId?: string
  ): Promise<Result<MovimientoStock[], GestionError>>;
  listProductos(actor: PortActor): Promise<Result<Producto[], GestionError>>;
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
