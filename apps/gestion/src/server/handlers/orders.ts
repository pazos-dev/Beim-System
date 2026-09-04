import { randomUUID } from "node:crypto";

import {
  movimientoStockSchema,
  ordenSchema,
  productoSchema,
  ventaSchema,
  type GestionError,
  type MovimientoStock,
  type Orden,
  type Producto,
  type Venta
} from "../data/schemas.js";
import { buildAuditEvent } from "./audit.js";
import { createGestionError, ERROR_CODES } from "./errors.js";
import { err, ok, type Result } from "./result.js";
import {
  createOrderInputSchema,
  derivePaymentStatus,
  nextOrderNumero,
  ORDER_STATUS,
  saleTotals,
  transitionOrder,
  updateOrderInputSchema,
  type CreateOrderInput,
  type OrderSaleInput,
  type OrderStatus
} from "../../lib/domain/orders/orden.js";
import {
  emptyMovimientos,
  emptyOrdenes,
  emptyProductos,
  emptyVentas,
  mapStoreError,
  ORDER_CREATE_ROLES,
  ORDER_PAYMENT_ROLES,
  ORDER_TRANSITION_ROLES,
  orderValidationError,
  readOrEmpty,
  restoreDocument,
  rollbackSteps,
  toRepositoryActor,
  type MovimientosStockDocument,
  type OrderActor,
  type OrderStores,
  type ProductosDocument,
  type VentasDocument
} from "./order-context.js";

export type { OrderActor, OrderStores };
export { createOrderStores, toOrderActor } from "./order-context.js";

export class OrderHandler {
  private readonly stores: OrderStores;

  public constructor(stores: OrderStores) {
    this.stores = stores;
  }

  public async list(actor: OrderActor): Promise<Result<Orden[], GestionError>> {
    return this.stores.ordenes.list(toRepositoryActor(actor));
  }

  public async getById(actor: OrderActor, id: string): Promise<Result<Orden, GestionError>> {
    return this.stores.ordenes.getById(toRepositoryActor(actor), id);
  }

  public async create(
    actor: OrderActor,
    input: unknown,
    idempotencyKey?: unknown
  ): Promise<Result<Orden, GestionError>> {
    const parsed = createOrderInputSchema.safeParse(input);
    if (!parsed.success) return err(orderValidationError(parsed.error.issues));
    if (!ORDER_CREATE_ROLES.has(actor.role)) {
      return err(createGestionError(ERROR_CODES.FORBIDDEN));
    }
    const run = (): Promise<Result<Orden, GestionError>> => this.createAtomic(actor, parsed.data);
    if (idempotencyKey === undefined) return run();
    return this.stores.idempotency.execute<Orden>(idempotencyKey, parsed.data, run);
  }

  public async update(
    actor: OrderActor,
    id: string,
    patch: unknown,
    expectedVersion: number
  ): Promise<Result<Orden, GestionError>> {
    const parsed = updateOrderInputSchema.safeParse(patch);
    if (!parsed.success) return err(orderValidationError(parsed.error.issues));
    if (parsed.data.estado !== undefined && !ORDER_TRANSITION_ROLES.has(actor.role)) {
      return err(createGestionError(ERROR_CODES.FORBIDDEN));
    }
    if (parsed.data.paymentStatus !== undefined && !ORDER_PAYMENT_ROLES.has(actor.role)) {
      return err(createGestionError(ERROR_CODES.FORBIDDEN));
    }
    const current = await this.stores.ordenes.getById(toRepositoryActor(actor), id);
    if (!current.ok) return current;
    if (current.value.version !== expectedVersion) {
      return err(createGestionError(ERROR_CODES.CONFLICT));
    }
    let estado: OrderStatus = current.value.estado;
    if (parsed.data.estado !== undefined) {
      const advanced = transitionOrder(current.value.estado, parsed.data.estado);
      if (!advanced.ok) return advanced;
      estado = advanced.value;
    }
    const next: Orden = {
      ...current.value,
      estado,
      paymentStatus: parsed.data.paymentStatus ?? current.value.paymentStatus,
      version: current.value.version + 1
    };
    const audited = await this.audit("orden.update", actor.id, id, null);
    if (!audited.ok) return audited;
    return this.stores.ordenes.update(toRepositoryActor(actor), id, next);
  }

  private async audit(
    accion: string,
    actorId: string,
    entidadId: string | null,
    detalles: Record<string, unknown> | null
  ): Promise<Result<undefined, GestionError>> {
    const appended = await this.stores.audit.append(
      buildAuditEvent(
        {
          accion,
          actorId,
          detalles: detalles ?? {},
          entidad: "orden",
          entidadId
        },
        "ok"
      )
    );
    if (!appended.ok) return err(appended.error);
    return ok(undefined);
  }

  private async createAtomic(actor: OrderActor, data: CreateOrderInput): Promise<Result<Orden, GestionError>> {
    // Owner de la orden = actor creador (clienteId solo relaciona con el cliente; GR-ORDERS.0: jamas se guardan secretos de desbloqueo en ordenes.json ni en la auditoria, solo ids minimizados).
    const [ordenes, clientes, productos, ventas, movimientos] = await Promise.all([
      readOrEmpty(this.stores.ordenesDocument, emptyOrdenes()),
      this.stores.clientes.read(),
      readOrEmpty(this.stores.productos, emptyProductos()),
      readOrEmpty(this.stores.ventas, emptyVentas()),
      readOrEmpty(this.stores.movimientos, emptyMovimientos())
    ]);
    if (!ordenes.ok) return ordenes;
    if (!clientes.ok) return err(mapStoreError(clientes.error));
    if (!productos.ok) return productos;
    if (!ventas.ok) return ventas;
    if (!movimientos.ok) return movimientos;

    if (!clientes.value.clientes.some((cliente) => cliente.id === data.clienteId)) {
      return err(createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["clienteId"] }));
    }
    const numero = data.numero ?? nextOrderNumero(ordenes.value.ordenes.map((order) => order.numero));
    if (ordenes.value.ordenes.some((order) => order.numero === numero)) {
      return err(createGestionError(ERROR_CODES.CONFLICT, { fields: ["numero"] }));
    }

    let total = data.total;
    let paymentStatus: Orden["paymentStatus"] = "pendiente";
    let venta: Venta | null = null;
    let nextProductos = productos.value;
    let nextMovimientos = movimientos.value;
    let nextVentas = ventas.value;

    if (data.sale !== undefined) {
      const built = this.buildSaleDocuments(actor, data.sale, ventas.value, productos.value, movimientos.value, total);
      if (!built.ok) return built;
      total = built.value.venta.total;
      paymentStatus = built.value.paymentStatus;
      venta = built.value.venta;
      nextProductos = built.value.productos;
      nextMovimientos = built.value.movimientos;
      nextVentas = built.value.ventas;
    }
    if (total === undefined) {
      return err(createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["total"] }));
    }

    const candidate = ordenSchema.safeParse({
      clienteId: data.clienteId,
      estado: ORDER_STATUS.EN_DIAGNOSTICO,
      id: `o_${randomUUID()}`,
      numero,
      ownerId: actor.id,
      paymentStatus,
      total,
      version: 1
    });
    if (!candidate.success) return err(orderValidationError(candidate.error.issues));

    const rollbacks: Array<() => Promise<void>> = [];
    const writtenProductos = await this.stores.productos.write(
      { productos: nextProductos.productos, version: productos.value.version + 1 },
      productos.value.version
    );
    if (!writtenProductos.ok) return err(mapStoreError(writtenProductos.error));
    rollbacks.push(() => restoreDocument(this.stores.productos, productos.value));

    const writtenMovimientos = await this.stores.movimientos.write(
      { movimientosStock: nextMovimientos.movimientosStock, version: movimientos.value.version + 1 },
      movimientos.value.version
    );
    if (!writtenMovimientos.ok) {
      await rollbackSteps(rollbacks);
      return err(mapStoreError(writtenMovimientos.error));
    }
    rollbacks.push(() => restoreDocument(this.stores.movimientos, movimientos.value));

    if (venta !== null) {
      const writtenVentas = await this.stores.ventas.write(
        { ventas: nextVentas.ventas, version: ventas.value.version + 1 },
        ventas.value.version
      );
      if (!writtenVentas.ok) {
        await rollbackSteps(rollbacks);
        return err(mapStoreError(writtenVentas.error));
      }
      rollbacks.push(() => restoreDocument(this.stores.ventas, ventas.value));
    }

    const writtenOrdenes = await this.stores.ordenesDocument.write(
      { ordenes: [...ordenes.value.ordenes, candidate.data], version: ordenes.value.version + 1 },
      ordenes.value.version
    );
    if (!writtenOrdenes.ok) {
      await rollbackSteps(rollbacks);
      return err(mapStoreError(writtenOrdenes.error));
    }

    const audited = await this.stores.audit.append(
      buildAuditEvent(
        {
          accion: "orden.create",
          actorId: actor.id,
          detalles: { numero, ordenId: candidate.data.id },
          entidad: "orden",
          entidadId: candidate.data.id
        },
        "ok"
      )
    );
    if (!audited.ok) {
      rollbacks.push(() => restoreDocument(this.stores.ordenesDocument, ordenes.value));
      await rollbackSteps(rollbacks);
      return err(audited.error);
    }
    return ok(candidate.data);
  }

  private buildSaleDocuments(
    actor: OrderActor,
    sale: OrderSaleInput,
    ventas: VentasDocument,
    productos: ProductosDocument,
    movimientos: MovimientosStockDocument,
    declaredTotal: number | undefined
  ): Result<
    {
      movimientos: MovimientosStockDocument;
      paymentStatus: Orden["paymentStatus"];
      productos: ProductosDocument;
      venta: Venta;
      ventas: VentasDocument;
    },
    GestionError
  > {
    const { paid, total } = saleTotals(sale);
    if (declaredTotal !== undefined && declaredTotal !== total) {
      return err(createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["total"] }));
    }
    if (paid > total) {
      return err(createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["sale.pagos"] }));
    }
    const ventaNumero = sale.numero ?? nextOrderNumero(ventas.ventas.map((item) => item.numero));
    if (ventas.ventas.some((item) => item.numero === ventaNumero)) {
      return err(createGestionError(ERROR_CODES.CONFLICT, { fields: ["sale.numero"] }));
    }

    const stockById = new Map<string, Producto>();
    for (const producto of productos.productos) stockById.set(producto.id, producto);
    for (const item of sale.items) {
      const producto = stockById.get(item.productoId);
      if (producto === undefined) {
        return err(createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["sale.items"] }));
      }
      if (producto.stock < item.cantidad) {
        return err(createGestionError(ERROR_CODES.CONFLICT, { fields: ["sale.items"] }));
      }
    }

    const ventaId = `v_${randomUUID()}`;
    const parsedVenta = ventaSchema.safeParse({
      estado: "confirmada",
      id: ventaId,
      items: sale.items.map((item) => ({
        cantidad: item.cantidad,
        precio: item.precio,
        productoId: item.productoId
      })),
      numero: ventaNumero,
      ownerId: actor.id,
      pagos: sale.pagos.map((pago) => ({ metodo: pago.metodo, monto: pago.monto })),
      total,
      version: 1
    });
    if (!parsedVenta.success) return err(orderValidationError(parsedVenta.error.issues));

    const consumed = new Map<string, number>();
    for (const item of sale.items) {
      consumed.set(item.productoId, (consumed.get(item.productoId) ?? 0) + item.cantidad);
    }
    const nextProducts: Producto[] = [];
    for (const producto of productos.productos) {
      const taken = consumed.get(producto.id) ?? 0;
      if (taken === 0) {
        nextProducts.push(producto);
        continue;
      }
      const parsed = productoSchema.safeParse({ ...producto, stock: producto.stock - taken });
      if (!parsed.success) return err(orderValidationError(parsed.error.issues));
      nextProducts.push({ ...parsed.data, version: producto.version + 1 });
    }

    const moves: MovimientoStock[] = [];
    for (const item of sale.items) {
      const producto = stockById.get(item.productoId);
      if (producto === undefined) continue;
      const taken = consumed.get(item.productoId) ?? 0;
      const parsedMove = movimientoStockSchema.safeParse({
        balanceAfter: producto.stock - taken,
        cantidad: -item.cantidad,
        id: `m_${randomUUID()}`,
        motivo: "venta",
        ownerId: actor.id,
        productoId: item.productoId,
        referencia: ventaId,
        version: 1
      });
      if (!parsedMove.success) return err(orderValidationError(parsedMove.error.issues));
      moves.push(parsedMove.data);
    }

    return ok({
      movimientos: {
        movimientosStock: [...movimientos.movimientosStock, ...moves],
        version: movimientos.version
      },
      paymentStatus: derivePaymentStatus(total, paid),
      productos: { productos: nextProducts, version: productos.version },
      venta: parsedVenta.data,
      ventas: { ventas: [...ventas.ventas, parsedVenta.data], version: ventas.version }
    });
  }
}
