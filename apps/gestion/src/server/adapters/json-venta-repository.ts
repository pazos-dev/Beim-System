import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { nextOrderNumero } from "../../lib/domain/orders/orden";
import { JsonStore, type VersionedDocument } from "../data/json-store";
import {
  movimientosStockDocumentSchema,
  movimientoStockSchema,
  ordenesDocumentSchema,
  productosDocumentSchema,
  ventasDocumentSchema,
  ventaSchema,
  type GestionError,
  type MovimientoStock,
  type Orden,
  type Producto,
  type Venta
} from "../data/schemas";
import { createGestionError, ERROR_CODES } from "../handlers/errors";
import {
  emptyMovimientos,
  emptyOrdenes,
  emptyProductos,
  emptyVentas,
  mapStoreError,
  orderValidationError,
  readOrEmpty,
  restoreDocument,
  rollbackSteps,
  type MovimientosStockDocument,
  type OrdenesDocument,
  type ProductosDocument,
  type VentasDocument
} from "../handlers/order-context";
import { err, ok, type Result } from "../handlers/result";
import type { PortActor } from "../ports/actor";
import type {
  VentaAnularInput,
  VentaAuditHook,
  VentaCreateInput,
  VentaRepositoryPort
} from "../ports/ventas";

function isVisible(actor: PortActor, ownerId: string): boolean {
  return actor.hasGlobalAccess || ownerId === actor.id;
}

interface SaleDocs {
  movimientos: MovimientosStockDocument;
  ordenes: OrdenesDocument;
  productos: ProductosDocument;
  ventas: VentasDocument;
}

export class JsonVentaRepository implements VentaRepositoryPort {
  private readonly dataDirectory: string;

  public constructor(dataDirectory: string) {
    this.dataDirectory = dataDirectory;
  }

  public async list(actor: PortActor): Promise<Result<Venta[], GestionError>> {
    const ventas = await this.readVentas();
    if (!ventas.ok) return ventas;
    return ok(ventas.value.ventas.filter((venta) => isVisible(actor, venta.ownerId)));
  }

  public async getById(actor: PortActor, id: string): Promise<Result<Venta, GestionError>> {
    if (id.trim() === "") {
      return err(createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["id"] }));
    }
    const ventas = await this.readVentas();
    if (!ventas.ok) return ventas;
    const found = ventas.value.ventas.find((venta) => venta.id === id);
    if (found === undefined || !isVisible(actor, found.ownerId)) {
      return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
    }
    return ok(found);
  }

  public async applyCreate(
    actor: PortActor,
    input: VentaCreateInput,
    audit: VentaAuditHook
  ): Promise<Result<Venta, GestionError>> {
    if (!("draft" in input)) {
      return this.applySingleCreate(actor, input.venta, audit);
    }
    const docs = await this.readDocs();
    if (!docs.ok) return docs;
    const { ventas, productos, movimientos, ordenes } = docs.value;
    const numero = input.draft.numero ?? nextOrderNumero(ventas.ventas.map((venta) => venta.numero));
    if (ventas.ventas.some((venta) => venta.numero === numero)) {
      return err(createGestionError(ERROR_CODES.CONFLICT, { fields: ["numero"] }));
    }
    const deltas = consolidate(input.deltas);
    const byId = new Map<string, Producto>(productos.productos.map((producto) => [producto.id, producto]));
    for (const [productoId, cantidad] of deltas) {
      const producto = byId.get(productoId);
      if (producto === undefined) {
        return err(createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["items"] }));
      }
      if (producto.stock < cantidad) {
        return err(createGestionError(ERROR_CODES.CONFLICT, { fields: ["items"] }));
      }
    }
    let nextOrdenes: OrdenesDocument | undefined;
    if (input.draft.ordenId !== undefined) {
      const orden = ordenes.ordenes.find((item) => item.id === input.draft.ordenId);
      if (orden === undefined || !isVisible(actor, orden.ownerId)) {
        return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
      }
      nextOrdenes = {
        ordenes: ordenes.ordenes.map((item) =>
          item.id === orden.id
            ? { ...item, paymentStatus: "pagado" as Orden["paymentStatus"], version: item.version + 1 }
            : item
        ),
        version: ordenes.version + 1
      };
    }
    const ventaId = `v_${randomUUID()}`;
    const parsedVenta = ventaSchema.safeParse({
      id: ventaId,
      ownerId: actor.id,
      version: 1,
      numero,
      estado: "confirmada",
      total: input.draft.total,
      items: input.draft.items,
      pagos: input.draft.pagos,
      fecha: input.draft.fecha,
      ...(input.draft.ordenId === undefined ? {} : { ordenId: input.draft.ordenId }),
      ...(input.draft.descuento === undefined ? {} : { descuento: input.draft.descuento })
    });
    if (!parsedVenta.success) return err(orderValidationError(parsedVenta.error.issues));
    const moves = buildMoves(actor.id, byId, deltas, -1, "venta", ventaId);
    if (!moves.ok) return moves;
    const rollbacks: Array<() => Promise<void>> = [];
    const c1 = await this.persist(
      this.productosStore(),
      { productos: applyStock(productos.productos, deltas, -1), version: productos.version + 1 },
      productos,
      rollbacks
    );
    if (!c1.ok) return c1;
    const c2 = await this.persist(
      this.movimientosStore(),
      { movimientosStock: [...movimientos.movimientosStock, ...moves.value], version: movimientos.version + 1 },
      movimientos,
      rollbacks
    );
    if (!c2.ok) return c2;
    const c3 = await this.persist(
      this.ventasStore(),
      { ventas: [...ventas.ventas, parsedVenta.data], version: ventas.version + 1 },
      ventas,
      rollbacks
    );
    if (!c3.ok) return c3;
    if (nextOrdenes !== undefined) {
      const committed = await this.persist(this.ordenesStore(), nextOrdenes, ordenes, rollbacks);
      if (!committed.ok) return committed;
    }
    const audited = await audit(parsedVenta.data);
    if (!audited.ok) {
      await rollbackSteps(rollbacks);
      return audited;
    }
    return ok(parsedVenta.data);
  }

  public async applyAnular(
    actor: PortActor,
    input: VentaAnularInput,
    audit: VentaAuditHook
  ): Promise<Result<Venta, GestionError>> {
    if (!("motivo" in input)) {
      return this.applySingleAnular(actor, input.venta, audit);
    }
    const docs = await this.readDocs();
    if (!docs.ok) return docs;
    const { ventas, productos, movimientos, ordenes } = docs.value;
    const current = ventas.ventas.find((venta) => venta.id === input.venta.id);
    if (current === undefined || !isVisible(actor, current.ownerId)) {
      return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
    }
    if (current.estado === "anulada") return ok(current);
    const deltas = consolidate(current.items.map((item) => ({ productoId: item.productoId, cantidad: item.cantidad })));
    const byId = new Map<string, Producto>(productos.productos.map((producto) => [producto.id, producto]));
    for (const productoId of deltas.keys()) {
      if (!byId.has(productoId)) {
        return err(createGestionError(ERROR_CODES.CONFLICT, { fields: ["items"] }));
      }
    }
    const reversals = buildMoves(actor.id, byId, deltas, 1, "anulacion", current.id);
    if (!reversals.ok) return reversals;
    const parsedVenta = ventaSchema.safeParse({ ...current, estado: "anulada", version: current.version + 1 });
    if (!parsedVenta.success) return err(orderValidationError(parsedVenta.error.issues));
    let nextOrdenes: OrdenesDocument | undefined;
    if (current.ordenId !== undefined) {
      const orden = ordenes.ordenes.find((item) => item.id === current.ordenId);
      if (orden !== undefined) {
        nextOrdenes = {
          ordenes: ordenes.ordenes.map((item) =>
            item.id === orden.id
              ? { ...item, paymentStatus: "pendiente" as Orden["paymentStatus"], version: item.version + 1 }
              : item
          ),
          version: ordenes.version + 1
        };
      }
    }
    const rollbacks: Array<() => Promise<void>> = [];
    const c1 = await this.persist(
      this.productosStore(),
      { productos: applyStock(productos.productos, deltas, 1), version: productos.version + 1 },
      productos,
      rollbacks
    );
    if (!c1.ok) return c1;
    const c2 = await this.persist(
      this.movimientosStore(),
      { movimientosStock: [...movimientos.movimientosStock, ...reversals.value], version: movimientos.version + 1 },
      movimientos,
      rollbacks
    );
    if (!c2.ok) return c2;
    const c3 = await this.persist(
      this.ventasStore(),
      { ventas: ventas.ventas.map((venta) => (venta.id === current.id ? parsedVenta.data : venta)), version: ventas.version + 1 },
      ventas,
      rollbacks
    );
    if (!c3.ok) return c3;
    if (nextOrdenes !== undefined) {
      const committed = await this.persist(this.ordenesStore(), nextOrdenes, ordenes, rollbacks);
      if (!committed.ok) return committed;
    }
    const audited = await audit(parsedVenta.data);
    if (!audited.ok) {
      await rollbackSteps(rollbacks);
      return audited;
    }
    return ok(parsedVenta.data);
  }

  private async applySingleCreate(
    actor: PortActor,
    venta: Venta,
    audit: VentaAuditHook
  ): Promise<Result<Venta, GestionError>> {
    if (!isVisible(actor, venta.ownerId)) {
      return err(createGestionError(ERROR_CODES.FORBIDDEN));
    }
    const ventas = await this.readVentas();
    if (!ventas.ok) return ventas;
    if (ventas.value.ventas.some((item) => item.id === venta.id)) {
      return err(createGestionError(ERROR_CODES.CONFLICT, { fields: ["id"] }));
    }
    if (ventas.value.ventas.some((item) => item.numero === venta.numero)) {
      return err(createGestionError(ERROR_CODES.CONFLICT, { fields: ["numero"] }));
    }
    const rollbacks: Array<() => Promise<void>> = [];
    const persisted = await this.persist(
      this.ventasStore(),
      { ventas: [...ventas.value.ventas, venta], version: ventas.value.version + 1 },
      ventas.value,
      rollbacks
    );
    if (!persisted.ok) return persisted;
    const audited = await audit(venta);
    if (!audited.ok) {
      await rollbackSteps(rollbacks);
      return audited;
    }
    return ok(venta);
  }

  private async applySingleAnular(
    actor: PortActor,
    venta: Venta,
    audit: VentaAuditHook
  ): Promise<Result<Venta, GestionError>> {
    const ventas = await this.readVentas();
    if (!ventas.ok) return ventas;
    const current = ventas.value.ventas.find((item) => item.id === venta.id);
    if (current === undefined || !isVisible(actor, current.ownerId)) {
      return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
    }
    const rollbacks: Array<() => Promise<void>> = [];
    const persisted = await this.persist(
      this.ventasStore(),
      {
        ventas: ventas.value.ventas.map((item) => (item.id === venta.id ? venta : item)),
        version: ventas.value.version + 1
      },
      ventas.value,
      rollbacks
    );
    if (!persisted.ok) return persisted;
    const audited = await audit(venta);
    if (!audited.ok) {
      await rollbackSteps(rollbacks);
      return audited;
    }
    return ok(venta);
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

  private async readDocs(): Promise<Result<SaleDocs, GestionError>> {
    const [ventas, productos, movimientos, ordenes] = await Promise.all([
      this.readVentas(),
      readOrEmpty(this.productosStore(), emptyProductos()),
      readOrEmpty(this.movimientosStore(), emptyMovimientos()),
      readOrEmpty(this.ordenesStore(), emptyOrdenes())
    ]);
    if (!ventas.ok) return ventas;
    if (!productos.ok) return err(productos.error);
    if (!movimientos.ok) return err(movimientos.error);
    if (!ordenes.ok) return err(ordenes.error);
    return ok({ ventas: ventas.value, productos: productos.value, movimientos: movimientos.value, ordenes: ordenes.value });
  }

  private async readVentas() {
    const store = this.ventasStore();
    return readOrEmpty(store, emptyVentas());
  }

  private ventasStore(): JsonStore<VentasDocument> {
    return new JsonStore(join(this.dataDirectory, "ventas.json"), ventasDocumentSchema);
  }

  private productosStore(): JsonStore<ProductosDocument> {
    return new JsonStore(join(this.dataDirectory, "productos.json"), productosDocumentSchema);
  }

  private movimientosStore(): JsonStore<MovimientosStockDocument> {
    return new JsonStore(join(this.dataDirectory, "movimientos-stock.json"), movimientosStockDocumentSchema);
  }

  private ordenesStore(): JsonStore<OrdenesDocument> {
    return new JsonStore(join(this.dataDirectory, "ordenes.json"), ordenesDocumentSchema);
  }
}

function consolidate(items: ReadonlyArray<{ productoId: string; cantidad: number }>): Map<string, number> {
  const deltas = new Map<string, number>();
  for (const item of items) deltas.set(item.productoId, (deltas.get(item.productoId) ?? 0) + item.cantidad);
  return deltas;
}

function applyStock(productos: Producto[], deltas: Map<string, number>, sign: 1 | -1): Producto[] {
  return productos.map((producto) => {
    const count = deltas.get(producto.id) ?? 0;
    return count === 0 ? producto : { ...producto, stock: producto.stock + sign * count, version: producto.version + 1 };
  });
}

function buildMoves(
  actorId: string,
  byId: Map<string, Producto>,
  deltas: Map<string, number>,
  sign: 1 | -1,
  motivo: "venta" | "anulacion",
  referencia: string
): Result<MovimientoStock[], GestionError> {
  const moves: MovimientoStock[] = [];
  for (const [productoId, cantidad] of deltas) {
    const producto = byId.get(productoId);
    if (producto === undefined) continue;
    const parsed = movimientoStockSchema.safeParse({
      id: `m_${randomUUID()}`,
      ownerId: actorId,
      version: 1,
      productoId,
      cantidad: sign * cantidad,
      motivo,
      referencia,
      balanceAfter: producto.stock + sign * cantidad
    });
    if (!parsed.success) return err(orderValidationError(parsed.error.issues));
    moves.push(parsed.data);
  }
  return ok(moves);
}
