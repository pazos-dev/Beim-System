import { join } from "node:path";

import { JsonStore } from "../data/json-store";
import {
  movimientosStockDocumentSchema,
  productosDocumentSchema,
  type GestionError,
  type MovimientoStock,
  type Producto
} from "../data/schemas";
import { createGestionError, ERROR_CODES } from "../handlers/errors";
import { emptyMovimientos, emptyProductos, readOrEmpty } from "../handlers/order-context";
import { err, ok, type Result } from "../handlers/result";
import type { PortActor } from "../ports/actor";
import type { StockRepositoryPort } from "../ports/stock";

function isVisible(actor: PortActor, ownerId: string): boolean {
  return actor.hasGlobalAccess || ownerId === actor.id;
}

export class JsonStockRepository implements StockRepositoryPort {
  private readonly dataDirectory: string;

  public constructor(dataDirectory: string) {
    this.dataDirectory = dataDirectory;
  }

  public async listProductos(actor: PortActor): Promise<Result<Producto[], GestionError>> {
    const productos = await this.readProductos();
    if (!productos.ok) return productos;
    return ok(productos.value.productos.filter((item) => isVisible(actor, item.ownerId)));
  }

  public async getProducto(actor: PortActor, id: string): Promise<Result<Producto, GestionError>> {
    if (id.trim() === "") {
      return err(createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["id"] }));
    }
    const productos = await this.readProductos();
    if (!productos.ok) return productos;
    const found = productos.value.productos.find((item) => item.id === id);
    if (found === undefined || !isVisible(actor, found.ownerId)) {
      return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
    }
    return ok(found);
  }

  public async listMovimientos(
    actor: PortActor,
    productoId?: string
  ): Promise<Result<MovimientoStock[], GestionError>> {
    const [productos, movimientos] = await Promise.all([
      this.readProductos(),
      this.readMovimientos()
    ]);
    if (!productos.ok) return err(productos.error);
    if (!movimientos.ok) return err(movimientos.error);
    const visibleIds = new Set(
      productos.value.productos.filter((item) => isVisible(actor, item.ownerId)).map((item) => item.id)
    );
    return ok(
      movimientos.value.movimientosStock.filter(
        (move) => visibleIds.has(move.productoId) && (productoId === undefined || move.productoId === productoId)
      )
    );
  }

  private async readProductos() {
    const store = new JsonStore(join(this.dataDirectory, "productos.json"), productosDocumentSchema);
    return readOrEmpty(store, emptyProductos());
  }

  private async readMovimientos() {
    const store = new JsonStore(
      join(this.dataDirectory, "movimientos-stock.json"),
      movimientosStockDocumentSchema
    );
    return readOrEmpty(store, emptyMovimientos());
  }
}
