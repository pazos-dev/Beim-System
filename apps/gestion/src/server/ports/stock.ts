import type { GestionError, MovimientoStock, Producto } from "../data/schemas";
import type { Result } from "../handlers/result";
import type { PortActor } from "./actor";

export interface StockRepositoryPort {
  getProducto(actor: PortActor, id: string): Promise<Result<Producto, GestionError>>;
  listMovimientos(
    actor: PortActor,
    productoId?: string
  ): Promise<Result<MovimientoStock[], GestionError>>;
  listProductos(actor: PortActor): Promise<Result<Producto[], GestionError>>;
}
