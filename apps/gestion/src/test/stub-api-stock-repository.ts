import type { Compra, GestionError, MovimientoStock, Producto } from "../server/data/schemas";
import { createGestionError, ERROR_CODES } from "../server/handlers/errors";
import { err, ok, type Result } from "../server/handlers/result";
import type { PortActor } from "../server/ports/actor";
import type { StockAuditHook, StockRepositoryPort } from "../server/ports/stock";

function isVisible(actor: PortActor, ownerId: string): boolean {
  return actor.hasGlobalAccess || ownerId === actor.id;
}

export class StubApiStockRepository implements StockRepositoryPort {
  private readonly compras: Compra[] = [
    {
      id: "co_1",
      ownerId: "u-mine",
      version: 1,
      productoId: "p_1",
      proveedor: "Proveedor Andina",
      cantidad: 2,
      costoUnitario: 50,
      comprobante: "FAC-001",
      fecha: "2026-01-10T12:00:00.000Z",
      total: 100
    },
    {
      id: "co_2",
      ownerId: "u-other",
      version: 1,
      productoId: "p_1",
      proveedor: "Proveedor Boreal",
      cantidad: 1,
      costoUnitario: 70,
      comprobante: "FAC-002",
      fecha: "2026-01-11T12:00:00.000Z",
      total: 70
    }
  ];

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

  public async listCompras(actor: PortActor): Promise<Result<Compra[], GestionError>> {
    return ok(this.compras.filter((item) => isVisible(actor, item.ownerId)));
  }

  public async getCompra(actor: PortActor, id: string): Promise<Result<Compra, GestionError>> {
    const found = this.compras.find((item) => item.id === id);
    if (found === undefined || !isVisible(actor, found.ownerId)) {
      return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
    }
    return ok(found);
  }

  public async applyOutflow(
    actor: PortActor,
    input: { movimiento: MovimientoStock; producto: Producto },
    audit: StockAuditHook
  ): Promise<Result<{ movimiento: MovimientoStock; producto: Producto }, GestionError>> {
    const index = this.productos.findIndex((item) => item.id === input.producto.id);
    const current = index === -1 ? undefined : this.productos[index];
    if (current === undefined || !isVisible(actor, current.ownerId)) {
      return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
    }
    this.productos[index] = input.producto;
    this.movimientos.push(input.movimiento);
    const audited = await audit();
    if (!audited.ok) {
      this.productos[index] = current;
      this.movimientos.pop();
      return audited;
    }
    return ok({ movimiento: input.movimiento, producto: input.producto });
  }

  public async applyTransferPair(
    actor: PortActor,
    input: { movimientos: readonly [MovimientoStock, MovimientoStock] },
    audit: StockAuditHook
  ): Promise<Result<{ movimientos: [MovimientoStock, MovimientoStock] }, GestionError>> {
    const [first, second] = input.movimientos;
    if (first === undefined || second === undefined) {
      return err(createGestionError(ERROR_CODES.STORAGE_ERROR));
    }
    const visible = this.productos.some(
      (item) => item.id === first.productoId && isVisible(actor, item.ownerId)
    );
    if (!visible) {
      return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
    }
    this.movimientos.push(first, second);
    const audited = await audit();
    if (!audited.ok) {
      this.movimientos.splice(-2);
      return audited;
    }
    return ok({ movimientos: [first, second] });
  }

  public async applyPurchase(
    actor: PortActor,
    input: { compra: Compra; movimiento: MovimientoStock; producto: Producto },
    audit: StockAuditHook
  ): Promise<Result<{ compra: Compra; movimiento: MovimientoStock; producto: Producto }, GestionError>> {
    const index = this.productos.findIndex((item) => item.id === input.producto.id);
    const current = index === -1 ? undefined : this.productos[index];
    if (current === undefined || !isVisible(actor, current.ownerId)) {
      return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
    }
    this.productos[index] = input.producto;
    this.compras.push(input.compra);
    this.movimientos.push(input.movimiento);
    const audited = await audit();
    if (!audited.ok) {
      this.productos[index] = current;
      this.compras.pop();
      this.movimientos.pop();
      return audited;
    }
    return ok({ compra: input.compra, movimiento: input.movimiento, producto: input.producto });
  }
}
