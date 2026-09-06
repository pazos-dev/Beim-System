import type { GestionError, MovimientoStock, Producto } from "../server/data/schemas";
import { createGestionError, ERROR_CODES } from "../server/handlers/errors";
import { err, ok, type Result } from "../server/handlers/result";
import type { PortActor } from "../server/ports/actor";
import type { StockRepositoryPort } from "../server/ports/stock";

function isVisible(actor: PortActor, ownerId: string): boolean {
  return actor.hasGlobalAccess || ownerId === actor.id;
}

export class StubApiStockRepository implements StockRepositoryPort {
  private readonly movimientos: MovimientoStock[] = [
    {
      id: "m_stub_1",
      ownerId: "u-mine",
      version: 1,
      productoId: "p_1",
      cantidad: 4,
      motivo: "compra",
      balanceAfter: 4
    }
  ];

  private readonly productos: Producto[] = [
    {
      id: "p_1",
      ownerId: "u-mine",
      version: 1,
      displayName: "Stub Producto",
      price: 100,
      cost: 60,
      stock: 8,
      minimum: 2,
      active: true
    }
  ];

  public async listProductos(actor: PortActor): Promise<Result<Producto[], GestionError>> {
    return ok(this.productos.filter((item) => isVisible(actor, item.ownerId)));
  }

  public async getProducto(actor: PortActor, id: string): Promise<Result<Producto, GestionError>> {
    const found = this.productos.find((item) => item.id === id);
    if (found === undefined || !isVisible(actor, found.ownerId)) {
      return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
    }
    return ok(found);
  }

  public async listMovimientos(
    actor: PortActor,
    productoId?: string
  ): Promise<Result<MovimientoStock[], GestionError>> {
    const visibleIds = new Set(
      this.productos.filter((item) => isVisible(actor, item.ownerId)).map((item) => item.id)
    );
    return ok(
      this.movimientos.filter(
        (move) => visibleIds.has(move.productoId) && (productoId === undefined || move.productoId === productoId)
      )
    );
  }
}
