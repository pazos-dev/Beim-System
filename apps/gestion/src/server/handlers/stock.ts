import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { z, ZodIssue } from "zod";
import { JsonStore, type VersionedDocument } from "../data/json-store";
import { auditDocumentSchema, compraSchema, comprasDocumentSchema, movimientosStockDocumentSchema, movimientoStockSchema, productoSchema, productosDocumentSchema, type Compra, type GestionError, type MovimientoStock, type Producto } from "../data/schemas";
import { AuditRepository, buildAuditEvent } from "./audit";
import type { AuthActor, Role } from "./auth";
import { createGestionError, ERROR_CODES } from "./errors";
import { emptyMovimientos, emptyProductos, mapStoreError, readOrEmpty, restoreDocument, rollbackSteps, type MovimientosStockDocument, type ProductosDocument } from "./order-context";
import { err, ok, type Result } from "./result";
import { balanceKey, DEPOSITS, deriveBalances, outflowInputSchema, planOutflow, planTransferPair, purchaseInputSchema, transferInputSchema, weightedAverageCost } from "../../lib/domain/inventory/inventory";
export interface StockActor { hasGlobalAccess: boolean; id: string; role: Role; }
export function toStockActor(auth: AuthActor): StockActor {
  return { hasGlobalAccess: auth.role === "administrador" || auth.role === "administrador_principal", id: auth.id, role: auth.role };
}
const STOCK_WRITE_ROLES: ReadonlySet<Role> = new Set(["administrador", "administrador_principal"]);
const STOCK_OUTFLOW_ROLES: ReadonlySet<Role> = new Set(["vendedor", "tecnico", "caja", "administrador", "administrador_principal"]);
export type ComprasDocument = z.infer<typeof comprasDocumentSchema>;
export interface StockStores { audit: AuditRepository; compras: JsonStore<ComprasDocument>; movimientos: JsonStore<MovimientosStockDocument>; productos: JsonStore<ProductosDocument>; }
export interface StockLevel { productoId: string; deposito: string; balance: number; stock: number; }
export function createStockStores(dataDirectory: string): StockStores {
  return {
    audit: new AuditRepository(new JsonStore(join(dataDirectory, "audit.json"), auditDocumentSchema)),
    compras: new JsonStore(join(dataDirectory, "compras.json"), comprasDocumentSchema),
    movimientos: new JsonStore(join(dataDirectory, "movimientos-stock.json"), movimientosStockDocumentSchema),
    productos: new JsonStore(join(dataDirectory, "productos.json"), productosDocumentSchema)
  };
}
function validationError(issues: ZodIssue[]): GestionError {
  return createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: issues.map((issue) => issue.path.join(".")) });
}
function visibleProducto(productos: ProductosDocument, actor: StockActor, id: string): Producto | undefined {
  const found = productos.productos.find((item) => item.id === id);
  if (found === undefined || (!actor.hasGlobalAccess && found.ownerId !== actor.id)) return undefined;
  return found;
}
export class StockHandler {
  private readonly stores: StockStores;
  public constructor(stores: StockStores) {
    this.stores = stores;
  }
  public async getStock(actor: StockActor, productoId: string, deposito?: string): Promise<Result<StockLevel, GestionError>> {
    const docs = await this.readAll();
    if (!docs.ok) return docs;
    const producto = visibleProducto(docs.value.productos, actor, productoId);
    if (producto === undefined) return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
    const target = deposito ?? DEPOSITS.PRINCIPAL;
    // producto.stock is the principal aggregate; secondary depositos derive purely from movements.
    const balance = target === DEPOSITS.PRINCIPAL ? producto.stock
      : (deriveBalances(docs.value.movimientos.movimientosStock).get(balanceKey(productoId, target)) ?? 0);
    return ok({ productoId, deposito: target, balance, stock: producto.stock });
  }
  public async registerPurchase(actor: StockActor, input: unknown): Promise<Result<{ compra: Compra; movimiento: MovimientoStock; producto: Producto }, GestionError>> {
    const parsed = purchaseInputSchema.safeParse(input);
    if (!parsed.success) return err(validationError(parsed.error.issues));
    if (!STOCK_WRITE_ROLES.has(actor.role)) return err(createGestionError(ERROR_CODES.FORBIDDEN));
    const docs = await this.readAll();
    if (!docs.ok) return docs;
    const producto = visibleProducto(docs.value.productos, actor, parsed.data.productoId);
    if (producto === undefined) return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
    // Owner of the compra and its movement is the session actor, mirroring orders.
    const cost = weightedAverageCost(producto.stock, producto.cost, parsed.data.cantidad, parsed.data.costoUnitario);
    const stock = producto.stock + parsed.data.cantidad;
    const parsedProducto = productoSchema.safeParse({ ...producto, cost, stock });
    if (!parsedProducto.success) return err(validationError(parsedProducto.error.issues));
    const nextProducto: Producto = { ...parsedProducto.data, version: producto.version + 1 };
    const compraId = `co_${randomUUID()}`;
    const parsedCompra = compraSchema.safeParse({ id: compraId, ownerId: actor.id, version: 1, productoId: producto.id, proveedor: parsed.data.proveedor, cantidad: parsed.data.cantidad, costoUnitario: parsed.data.costoUnitario, deposito: parsed.data.deposito, fecha: new Date().toISOString(), total: Math.round(parsed.data.cantidad * parsed.data.costoUnitario * 100) / 100 });
    if (!parsedCompra.success) return err(validationError(parsedCompra.error.issues));
    const parsedMovimiento = movimientoStockSchema.safeParse({ id: `m_${randomUUID()}`, ownerId: actor.id, version: 1, productoId: producto.id, deposito: parsed.data.deposito, cantidad: parsed.data.cantidad, motivo: "compra", referencia: compraId, balanceAfter: stock });
    if (!parsedMovimiento.success) return err(validationError(parsedMovimiento.error.issues));
    const rollbacks: Array<() => Promise<void>> = [];
    const next = {
      compras: { compras: [...docs.value.compras.compras, parsedCompra.data], version: docs.value.compras.version + 1 },
      productos: { productos: docs.value.productos.productos.map((item) => (item.id === producto.id ? nextProducto : item)), version: docs.value.productos.version + 1 },
      movimientos: { movimientosStock: [...docs.value.movimientos.movimientosStock, parsedMovimiento.data], version: docs.value.movimientos.version + 1 }
    };
    for (const step of [
      { store: this.stores.compras, doc: next.compras, snapshot: docs.value.compras },
      { store: this.stores.productos, doc: next.productos, snapshot: docs.value.productos },
      { store: this.stores.movimientos, doc: next.movimientos, snapshot: docs.value.movimientos }
    ] as Array<{ store: JsonStore<VersionedDocument>; doc: VersionedDocument; snapshot: VersionedDocument }>) {
      const committed = await this.commitStep(step.store, step.doc, step.snapshot, rollbacks);
      if (!committed.ok) return committed;
    }
    const audited = await this.audit("stock.purchase", actor.id, "compra", compraId, { productoId: producto.id });
    if (!audited.ok) {
      await rollbackSteps(rollbacks);
      return audited;
    }
    return ok({ compra: parsedCompra.data, movimiento: parsedMovimiento.data, producto: nextProducto });
  }
  public async transfer(actor: StockActor, input: unknown): Promise<Result<{ movimientos: [MovimientoStock, MovimientoStock] }, GestionError>> {
    const parsed = transferInputSchema.safeParse(input);
    if (!parsed.success) return err(validationError(parsed.error.issues));
    if (!STOCK_WRITE_ROLES.has(actor.role)) return err(createGestionError(ERROR_CODES.FORBIDDEN));
    const docs = await this.readAll();
    if (!docs.ok) return docs;
    const producto = visibleProducto(docs.value.productos, actor, parsed.data.productoId);
    if (producto === undefined) return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
    const balances = deriveBalances(docs.value.movimientos.movimientosStock);
    const principalKey = balanceKey(producto.id, DEPOSITS.PRINCIPAL);
    const hasPrincipalHistory = docs.value.movimientos.movimientosStock.some((move) => balanceKey(move.productoId, move.deposito) === principalKey);
    // Legacy aggregate seeds principal only when no explicit movement history exists.
    if (!hasPrincipalHistory) balances.set(principalKey, producto.stock);
    const pair = planTransferPair(balances, parsed.data);
    if (!pair.ok) return pair;
    const group = `t_${randomUUID()}`;
    const parsedMoves: MovimientoStock[] = [];
    for (const draft of [{ ...pair.value.leaving, referencia: group }, { ...pair.value.arriving, referencia: group }]) {
      const candidate = movimientoStockSchema.safeParse({ id: `m_${randomUUID()}`, ownerId: actor.id, version: 1, productoId: producto.id, deposito: draft.deposito, cantidad: draft.cantidad, motivo: "transferencia", referencia: draft.referencia, balanceAfter: draft.balanceAfter });
      if (!candidate.success) return err(validationError(candidate.error.issues));
      parsedMoves.push(candidate.data);
    }
    const [first, second] = parsedMoves;
    if (first === undefined || second === undefined) return err(createGestionError(ERROR_CODES.STORAGE_ERROR));
    const written = await this.stores.movimientos.write({ movimientosStock: [...docs.value.movimientos.movimientosStock, first, second], version: docs.value.movimientos.version + 1 }, docs.value.movimientos.version);
    if (!written.ok) return err(mapStoreError(written.error));
    const audited = await this.audit("stock.transfer", actor.id, "movimiento-stock", group, { productoId: producto.id });
    if (!audited.ok) {
      await restoreDocument(this.stores.movimientos, docs.value.movimientos);
      return audited;
    }
    return ok({ movimientos: [first, second] });
  }
  public async registerOutflow(actor: StockActor, input: unknown): Promise<Result<{ movimiento: MovimientoStock; producto: Producto }, GestionError>> {
    const parsed = outflowInputSchema.safeParse(input);
    if (!parsed.success) return err(validationError(parsed.error.issues));
    if (!STOCK_OUTFLOW_ROLES.has(actor.role)) return err(createGestionError(ERROR_CODES.FORBIDDEN));
    if (parsed.data.ajuste && actor.role !== "administrador_principal") return err(createGestionError(ERROR_CODES.FORBIDDEN));
    const docs = await this.readAll();
    if (!docs.ok) return docs;
    const producto = visibleProducto(docs.value.productos, actor, parsed.data.productoId);
    if (producto === undefined) return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
    const planned = planOutflow(producto.stock, parsed.data, parsed.data.ajuste);
    if (!planned.ok) return planned;
    const parsedProducto = productoSchema.safeParse({ ...producto, stock: producto.stock - parsed.data.cantidad });
    if (!parsedProducto.success) return err(validationError(parsedProducto.error.issues));
    const nextProducto: Producto = { ...parsedProducto.data, version: producto.version + 1 };
    const parsedMovimiento = movimientoStockSchema.safeParse({ id: `m_${randomUUID()}`, ownerId: actor.id, version: 1, productoId: producto.id, deposito: parsed.data.deposito, cantidad: planned.value.cantidad, motivo: planned.value.motivo, referencia: parsed.data.ajuste ? "ajuste" : undefined, balanceAfter: planned.value.balanceAfter });
    if (!parsedMovimiento.success) return err(validationError(parsedMovimiento.error.issues));
    const rollbacks: Array<() => Promise<void>> = [];
    const nextProductos: ProductosDocument = { productos: docs.value.productos.productos.map((item) => (item.id === producto.id ? nextProducto : item)), version: docs.value.productos.version + 1 };
    const committed = await this.commitStep(this.stores.productos, nextProductos, docs.value.productos, rollbacks);
    if (!committed.ok) return committed;
    const nextMovimientos: MovimientosStockDocument = { movimientosStock: [...docs.value.movimientos.movimientosStock, parsedMovimiento.data], version: docs.value.movimientos.version + 1 };
    const committedMoves = await this.commitStep(this.stores.movimientos, nextMovimientos, docs.value.movimientos, rollbacks);
    if (!committedMoves.ok) return committedMoves;
    const audited = await this.audit("stock.outflow", actor.id, "movimiento-stock", parsedMovimiento.data.id, { productoId: producto.id });
    if (!audited.ok) {
      await rollbackSteps(rollbacks);
      return audited;
    }
    return ok({ movimiento: parsedMovimiento.data, producto: nextProducto });
  }
  private async readAll(): Promise<Result<{ productos: ProductosDocument; movimientos: MovimientosStockDocument; compras: ComprasDocument }, GestionError>> {
    const [productos, movimientos, compras] = await Promise.all([
      readOrEmpty(this.stores.productos, emptyProductos()),
      readOrEmpty(this.stores.movimientos, emptyMovimientos()),
      readOrEmpty(this.stores.compras, { compras: [], version: 0 })
    ]);
    if (!productos.ok) return productos;
    if (!movimientos.ok) return movimientos;
    if (!compras.ok) return compras;
    return ok({ productos: productos.value, movimientos: movimientos.value, compras: compras.value });
  }
  private async commitStep<T extends VersionedDocument>(store: JsonStore<T>, next: T, snapshot: T, rollbacks: Array<() => Promise<void>>): Promise<Result<undefined, GestionError>> {
    const written = await store.write(next, snapshot.version);
    if (!written.ok) {
      await rollbackSteps(rollbacks);
      return err(mapStoreError(written.error));
    }
    rollbacks.push(() => restoreDocument(store, snapshot));
    return ok(undefined);
  }
  private async audit(accion: string, actorId: string, entidad: string, entidadId: string, detalles: Record<string, unknown>): Promise<Result<undefined, GestionError>> {
    const appended = await this.stores.audit.append(buildAuditEvent({ accion, actorId, entidad, entidadId, detalles }, "ok"));
    if (!appended.ok) return err(appended.error);
    return ok(undefined);
  }
}
