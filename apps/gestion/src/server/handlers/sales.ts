import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { JsonStore } from "../data/json-store";
import { movimientoStockSchema, ventaDescuentoSchema, ventaSchema, type GestionError, type MovimientoStock, type Orden, type Producto, type Venta } from "../data/schemas";
import { buildAuditEvent } from "./audit";
import type { Role } from "./auth";
import { createGestionError, ERROR_CODES } from "./errors";
import { emptyMovimientos, emptyOrdenes, emptyProductos, emptyVentas, mapStoreError, orderValidationError, readOrEmpty, restoreDocument, rollbackSteps, toRepositoryActor, type MovimientosStockDocument, type OrdenesDocument, type OrderActor, type OrderStores, type ProductosDocument, type VentasDocument } from "./order-context";
import { nextOrderNumero } from "../../lib/domain/orders/orden";
import { err, ok, type Result } from "./result";

export const SALE_CREATE_ROLES: ReadonlySet<Role> = new Set(["vendedor", "caja", "administrador", "administrador_principal"]);
export const SALE_ANULAR_ROLES: ReadonlySet<Role> = new Set(["administrador", "administrador_principal"]);

const saleItemSchema = z.object({ productoId: z.string().min(1).max(100), cantidad: z.number().int().positive(), precio: z.number().min(0) });
const salePaymentSchema = z.object({ metodo: z.enum(["efectivo", "tarjeta", "transferencia", "mixto"]), monto: z.number().min(0) });
const createSaleInputSchema = z.object({ numero: z.string().min(1).max(40).optional(), items: z.array(saleItemSchema).min(1), pagos: z.array(salePaymentSchema).min(1), descuentos: z.array(ventaDescuentoSchema).max(1, { error: "At most one discount per sale." }).optional(), ordenId: z.string().min(1).max(100).optional() });
const anularSaleInputSchema = z.object({ motivo: z.string().min(1).max(200) });
interface SaleDocs { ventas: VentasDocument; productos: ProductosDocument; movimientos: MovimientosStockDocument; ordenes: OrdenesDocument; }
function visibleVenta(actor: OrderActor, venta: Venta | undefined): Venta | undefined {
  if (venta === undefined) return undefined;
  const repo = toRepositoryActor(actor);
  return repo.hasGlobalAccess || venta.ownerId === actor.id ? venta : undefined;
}

export class SalesHandler {
  public constructor(private readonly stores: OrderStores) { }
  public async list(actor: OrderActor): Promise<Result<Venta[], GestionError>> {
    const docs = await this.readDocs();
    if (!docs.ok) return docs;
    return ok(docs.value.ventas.ventas.filter((venta) => visibleVenta(actor, venta) !== undefined));
  }
  public async getById(actor: OrderActor, id: string): Promise<Result<Venta, GestionError>> {
    const docs = await this.readDocs();
    if (!docs.ok) return docs;
    const found = visibleVenta(actor, docs.value.ventas.ventas.find((venta) => venta.id === id));
    if (found === undefined) return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
    return ok(found);
  }
  public async create(actor: OrderActor, input: unknown, idempotencyKey?: unknown): Promise<Result<Venta, GestionError>> {
    const parsed = createSaleInputSchema.safeParse(input);
    if (!parsed.success) return err(orderValidationError(parsed.error.issues));
    if (!SALE_CREATE_ROLES.has(actor.role)) return err(createGestionError(ERROR_CODES.FORBIDDEN));
    const run = (): Promise<Result<Venta, GestionError>> => this.createAtomic(actor, parsed.data);
    if (idempotencyKey === undefined) return run();
    return this.stores.idempotency.execute<Venta>(idempotencyKey, parsed.data, run);
  }
  public async anular(actor: OrderActor, id: string, input: unknown, idempotencyKey?: unknown): Promise<Result<Venta, GestionError>> {
    const parsed = anularSaleInputSchema.safeParse(input);
    if (!parsed.success) return err(orderValidationError(parsed.error.issues));
    if (!SALE_ANULAR_ROLES.has(actor.role)) return err(createGestionError(ERROR_CODES.FORBIDDEN));
    if (idempotencyKey === undefined) return this.anularAtomic(actor, id, parsed.data.motivo);
    return this.stores.idempotency.execute<Venta>(idempotencyKey, { id, motivo: parsed.data.motivo }, () => this.anularAtomic(actor, id, parsed.data.motivo));
  }
  private async createAtomic(actor: OrderActor, data: z.infer<typeof createSaleInputSchema>): Promise<Result<Venta, GestionError>> {
    const docs = await this.readDocs();
    if (!docs.ok) return docs;
    const { ventas, productos, movimientos, ordenes } = docs.value;
    const itemsTotal = data.items.reduce((sum, item) => sum + item.cantidad * item.precio, 0);
    const discount = data.descuentos?.[0]?.monto ?? 0;
    if (discount > itemsTotal) return err(createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["descuentos"] }));
    const total = itemsTotal - discount;
    if (data.pagos.reduce((sum, pago) => sum + pago.monto, 0) !== total) return err(createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["pagos"] }));
    const numero = data.numero ?? nextOrderNumero(ventas.ventas.map((venta) => venta.numero));
    if (ventas.ventas.some((venta) => venta.numero === numero)) return err(createGestionError(ERROR_CODES.CONFLICT, { fields: ["numero"] }));
    const deltas = this.consolidate(data.items.map((item) => ({ productoId: item.productoId, cantidad: item.cantidad })));
    const byId = new Map<string, Producto>(productos.productos.map((producto) => [producto.id, producto]));
    for (const [productoId, cantidad] of deltas) {
      const producto = byId.get(productoId);
      if (producto === undefined) return err(createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["items"] }));
      if (producto.stock < cantidad) return err(createGestionError(ERROR_CODES.CONFLICT, { fields: ["items"] }));
    }
    let nextOrdenes: OrdenesDocument | undefined;
    if (data.ordenId !== undefined) {
      const orden = ordenes.ordenes.find((item) => item.id === data.ordenId);
      if (orden === undefined || (!actor.hasGlobalAccess && orden.ownerId !== actor.id)) return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
      nextOrdenes = { ordenes: ordenes.ordenes.map((item) => item.id === orden.id ? { ...item, paymentStatus: "pagado" as Orden["paymentStatus"], version: item.version + 1 } : item), version: ordenes.version + 1 };
    }
    const ventaId = `v_${randomUUID()}`;
    const parsedVenta = ventaSchema.safeParse({ id: ventaId, ownerId: actor.id, version: 1, numero, estado: "confirmada", total, items: data.items, pagos: data.pagos, ...(data.ordenId === undefined ? {} : { ordenId: data.ordenId }), ...(data.descuentos?.[0] === undefined ? {} : { descuento: data.descuentos[0] }) });
    if (!parsedVenta.success) return err(orderValidationError(parsedVenta.error.issues));
    const moves = this.buildMoves(actor.id, byId, deltas, -1, "venta", ventaId);
    if (!moves.ok) return moves;
    const rollbacks: Array<() => Promise<void>> = [];
    const c1 = await this.commit(this.stores.productos, { productos: this.applyStock(productos.productos, deltas, -1), version: productos.version + 1 }, productos, rollbacks);
    if (!c1.ok) return c1;
    const c2 = await this.commit(this.stores.movimientos, { movimientosStock: [...movimientos.movimientosStock, ...moves.value], version: movimientos.version + 1 }, movimientos, rollbacks);
    if (!c2.ok) return c2;
    const c3 = await this.commit(this.stores.ventas, { ventas: [...ventas.ventas, parsedVenta.data], version: ventas.version + 1 }, ventas, rollbacks);
    if (!c3.ok) return c3;
    if (nextOrdenes !== undefined) {
      const committed = await this.commit(this.stores.ordenesDocument, nextOrdenes, ordenes, rollbacks);
      if (!committed.ok) return committed;
    }
    const audited = await this.audit(actor.id, "venta.create", ventaId, { numero, total, ...(data.ordenId === undefined ? {} : { ordenId: data.ordenId }) });
    if (!audited.ok) { await rollbackSteps(rollbacks); return audited; }
    return ok(parsedVenta.data);
  }
  private async anularAtomic(actor: OrderActor, id: string, motivo: string): Promise<Result<Venta, GestionError>> {
    const docs = await this.readDocs();
    if (!docs.ok) return docs;
    const { ventas, productos, movimientos, ordenes } = docs.value;
    const current = ventas.ventas.find((item) => item.id === id);
    // Reintento seguro por chequeo de estado: una venta ya anulada se devuelve tal cual, sin movimientos nuevos.
    if (current === undefined || (visibleVenta(actor, current) === undefined && !SALE_ANULAR_ROLES.has(actor.role))) return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
    if (current.estado === "anulada") return ok(current);
    const deltas = this.consolidate(current.items.map((item) => ({ productoId: item.productoId, cantidad: item.cantidad })));
    const byId = new Map<string, Producto>(productos.productos.map((producto) => [producto.id, producto]));
    for (const productoId of deltas.keys()) if (!byId.has(productoId)) return err(createGestionError(ERROR_CODES.CONFLICT, { fields: ["items"] }));
    const reversals = this.buildMoves(actor.id, byId, deltas, 1, "anulacion", current.id);
    if (!reversals.ok) return reversals;
    const parsedVenta = ventaSchema.safeParse({ ...current, estado: "anulada", version: current.version + 1 });
    if (!parsedVenta.success) return err(orderValidationError(parsedVenta.error.issues));
    let nextOrdenes: OrdenesDocument | undefined;
    if (current.ordenId !== undefined) {
      const orden = ordenes.ordenes.find((item) => item.id === current.ordenId);
      if (orden !== undefined) nextOrdenes = { ordenes: ordenes.ordenes.map((item) => item.id === orden.id ? { ...item, paymentStatus: "pendiente" as Orden["paymentStatus"], version: item.version + 1 } : item), version: ordenes.version + 1 };
    }
    const rollbacks: Array<() => Promise<void>> = [];
    const c1 = await this.commit(this.stores.productos, { productos: this.applyStock(productos.productos, deltas, 1), version: productos.version + 1 }, productos, rollbacks);
    if (!c1.ok) return c1;
    const c2 = await this.commit(this.stores.movimientos, { movimientosStock: [...movimientos.movimientosStock, ...reversals.value], version: movimientos.version + 1 }, movimientos, rollbacks);
    if (!c2.ok) return c2;
    const c3 = await this.commit(this.stores.ventas, { ventas: ventas.ventas.map((item) => item.id === current.id ? parsedVenta.data : item), version: ventas.version + 1 }, ventas, rollbacks);
    if (!c3.ok) return c3;
    if (nextOrdenes !== undefined) {
      const committed = await this.commit(this.stores.ordenesDocument, nextOrdenes, ordenes, rollbacks);
      if (!committed.ok) return committed;
    }
    const audited = await this.audit(actor.id, "venta.anular", current.id, { motivo });
    if (!audited.ok) { await rollbackSteps(rollbacks); return audited; }
    return ok(parsedVenta.data);
  }
  private consolidate(items: ReadonlyArray<{ productoId: string; cantidad: number }>): Map<string, number> {
    const deltas = new Map<string, number>();
    for (const item of items) deltas.set(item.productoId, (deltas.get(item.productoId) ?? 0) + item.cantidad);
    return deltas;
  }
  private applyStock(productos: Producto[], deltas: Map<string, number>, sign: 1 | -1): Producto[] {
    return productos.map((producto) => {
      const count = deltas.get(producto.id) ?? 0;
      return count === 0 ? producto : { ...producto, stock: producto.stock + sign * count, version: producto.version + 1 };
    });
  }
  private buildMoves(actorId: string, byId: Map<string, Producto>, deltas: Map<string, number>, sign: 1 | -1, motivo: "venta" | "anulacion", referencia: string): Result<MovimientoStock[], GestionError> {
    const moves: MovimientoStock[] = [];
    for (const [productoId, cantidad] of deltas) {
      const producto = byId.get(productoId);
      if (producto === undefined) continue;
      const parsed = movimientoStockSchema.safeParse({ id: `m_${randomUUID()}`, ownerId: actorId, version: 1, productoId, cantidad: sign * cantidad, motivo, referencia, balanceAfter: producto.stock + sign * cantidad });
      if (!parsed.success) return err(orderValidationError(parsed.error.issues));
      moves.push(parsed.data);
    }
    return ok(moves);
  }
  private async readDocs(): Promise<Result<SaleDocs, GestionError>> {
    const [ventas, productos, movimientos, ordenes] = await Promise.all([readOrEmpty(this.stores.ventas, emptyVentas()), readOrEmpty(this.stores.productos, emptyProductos()), readOrEmpty(this.stores.movimientos, emptyMovimientos()), readOrEmpty(this.stores.ordenesDocument, emptyOrdenes())]);
    if (!ventas.ok) return ventas;
    if (!productos.ok) return productos;
    if (!movimientos.ok) return movimientos;
    if (!ordenes.ok) return ordenes;
    return ok({ ventas: ventas.value, productos: productos.value, movimientos: movimientos.value, ordenes: ordenes.value });
  }
  private async commit<T extends { version: number }>(store: JsonStore<T>, next: T, snapshot: T, rollbacks: Array<() => Promise<void>>): Promise<Result<undefined, GestionError>> {
    const written = await store.write(next, snapshot.version);
    if (!written.ok) { await rollbackSteps(rollbacks); return err(mapStoreError(written.error)); }
    rollbacks.push(() => restoreDocument(store, snapshot));
    return ok(undefined);
  }
  private async audit(actorId: string, accion: string, entidadId: string, detalles: Record<string, unknown>): Promise<Result<undefined, GestionError>> {
    const appended = await this.stores.audit.append(buildAuditEvent({ accion, actorId, entidad: "venta", entidadId, detalles }, "ok"));
    if (!appended.ok) return err(appended.error);
    return ok(undefined);
  }
}
