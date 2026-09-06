import { join } from "node:path";

import { JsonStore, type VersionedDocument } from "../data/json-store";
import {
  comprasDocumentSchema,
  movimientosStockDocumentSchema,
  productosDocumentSchema,
  type Compra,
  type GestionError,
  type MovimientoStock,
  type Producto
} from "../data/schemas";
import { createGestionError, ERROR_CODES } from "../handlers/errors";
import {
  emptyMovimientos,
  emptyProductos,
  mapStoreError,
  readOrEmpty,
  restoreDocument,
  rollbackSteps,
  type MovimientosStockDocument,
  type ProductosDocument
} from "../handlers/order-context";
import { err, ok, type Result } from "../handlers/result";
import type { PortActor } from "../ports/actor";
import type { StockAuditHook, StockRepositoryPort } from "../ports/stock";

function isVisible(actor: PortActor, ownerId: string): boolean {
  return actor.hasGlobalAccess || ownerId === actor.id;
}

function owns(productos: ProductosDocument, actor: PortActor, productoId: string): boolean {
  const found = productos.productos.find((item) => item.id === productoId);
  return found !== undefined && isVisible(actor, found.ownerId);
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

  public async listCompras(actor: PortActor): Promise<Result<Compra[], GestionError>> {
    const compras = await this.readCompras();
    if (!compras.ok) return err(compras.error);
    return ok(compras.value.compras.filter((item) => isVisible(actor, item.ownerId)));
  }

  public async getCompra(actor: PortActor, id: string): Promise<Result<Compra, GestionError>> {
    if (id.trim() === "") {
      return err(createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["id"] }));
    }
    const compras = await this.readCompras();
    if (!compras.ok) return err(compras.error);
    const found = compras.value.compras.find((item) => item.id === id);
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
    const productos = await this.readProductos();
    if (!productos.ok) return productos;
    const movimientos = await this.readMovimientos();
    if (!movimientos.ok) return err(movimientos.error);
    if (!owns(productos.value, actor, input.producto.id)) {
      return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
    }
    const rollbacks: Array<() => Promise<void>> = [];
    const nextProductos: ProductosDocument = {
      productos: productos.value.productos.map((item) => (item.id === input.producto.id ? input.producto : item)),
      version: productos.value.version + 1
    };
    const persisted = await this.persist(this.productosStore(), nextProductos, productos.value, rollbacks);
    if (!persisted.ok) return persisted;
    const nextMovimientos: MovimientosStockDocument = {
      movimientosStock: [...movimientos.value.movimientosStock, input.movimiento],
      version: movimientos.value.version + 1
    };
    const persistedMoves = await this.persist(this.movimientosStore(), nextMovimientos, movimientos.value, rollbacks);
    if (!persistedMoves.ok) return persistedMoves;
    const audited = await audit();
    if (!audited.ok) {
      await rollbackSteps(rollbacks);
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
    const productos = await this.readProductos();
    if (!productos.ok) return productos;
    const movimientos = await this.readMovimientos();
    if (!movimientos.ok) return err(movimientos.error);
    if (!owns(productos.value, actor, first.productoId)) {
      return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
    }
    const next: MovimientosStockDocument = {
      movimientosStock: [...movimientos.value.movimientosStock, first, second],
      version: movimientos.value.version + 1
    };
    const written = await this.movimientosStore().write(next, movimientos.value.version);
    if (!written.ok) return err(mapStoreError(written.error));
    const audited = await audit();
    if (!audited.ok) {
      await restoreDocument(this.movimientosStore(), movimientos.value);
      return audited;
    }
    return ok({ movimientos: [first, second] });
  }

  public async applyPurchase(
    actor: PortActor,
    input: { compra: Compra; movimiento: MovimientoStock; producto: Producto },
    audit: StockAuditHook
  ): Promise<Result<{ compra: Compra; movimiento: MovimientoStock; producto: Producto }, GestionError>> {
    const [productos, movimientos, compras] = await Promise.all([
      this.readProductos(),
      this.readMovimientos(),
      this.readCompras()
    ]);
    if (!productos.ok) return productos;
    if (!movimientos.ok) return err(movimientos.error);
    if (!compras.ok) return err(compras.error);
    if (!owns(productos.value, actor, input.producto.id)) {
      return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
    }
    const rollbacks: Array<() => Promise<void>> = [];
    const nextCompras = { compras: [...compras.value.compras, input.compra], version: compras.value.version + 1 };
    const persistedCompras = await this.persist(this.comprasStore(), nextCompras, compras.value, rollbacks);
    if (!persistedCompras.ok) return persistedCompras;
    const nextProductos: ProductosDocument = {
      productos: productos.value.productos.map((item) => (item.id === input.producto.id ? input.producto : item)),
      version: productos.value.version + 1
    };
    const persistedProductos = await this.persist(this.productosStore(), nextProductos, productos.value, rollbacks);
    if (!persistedProductos.ok) return persistedProductos;
    const nextMovimientos: MovimientosStockDocument = {
      movimientosStock: [...movimientos.value.movimientosStock, input.movimiento],
      version: movimientos.value.version + 1
    };
    const persistedMovimientos = await this.persist(
      this.movimientosStore(),
      nextMovimientos,
      movimientos.value,
      rollbacks
    );
    if (!persistedMovimientos.ok) return persistedMovimientos;
    const audited = await audit();
    if (!audited.ok) {
      await rollbackSteps(rollbacks);
      return audited;
    }
    return ok({ compra: input.compra, movimiento: input.movimiento, producto: input.producto });
  }

  private async persist<T extends VersionedDocument>(
    store: JsonStore<T>,
    next: T,
    snapshot: T,
    rollbacks: Array<() => Promise<void>>
  ): Promise<Result<undefined, GestionError>> {
    const written = await store.write(next, snapshot.version);
    if (!written.ok) {
      await rollbackSteps(rollbacks);
      return err(mapStoreError(written.error));
    }
    rollbacks.push(() => restoreDocument(store, snapshot));
    return ok(undefined);
  }

  private async readProductos() {
    const store = this.productosStore();
    return readOrEmpty(store, emptyProductos());
  }

  private async readMovimientos() {
    const store = this.movimientosStore();
    return readOrEmpty(store, emptyMovimientos());
  }

  private async readCompras() {
    const store = this.comprasStore();
    return readOrEmpty(store, { compras: [], version: 0 });
  }

  private productosStore(): JsonStore<ProductosDocument> {
    return new JsonStore(join(this.dataDirectory, "productos.json"), productosDocumentSchema);
  }

  private movimientosStore(): JsonStore<MovimientosStockDocument> {
    return new JsonStore(join(this.dataDirectory, "movimientos-stock.json"), movimientosStockDocumentSchema);
  }

  private comprasStore(): JsonStore<{ compras: Compra[]; version: number }> {
    return new JsonStore(join(this.dataDirectory, "compras.json"), comprasDocumentSchema);
  }
}
