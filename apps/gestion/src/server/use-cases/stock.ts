import { randomUUID } from "node:crypto";

import { z } from "zod";

import {
  balanceKey,
  DEPOSITS,
  deriveBalances,
  outflowInputSchema,
  planOutflow,
  planTransferPair,
  purchaseInputSchema,
  transferInputSchema,
  weightedAverageCost,
  type OutflowInput,
  type PurchaseInput,
  type TransferInput
} from "../../lib/domain/inventory/inventory";
import { STOCK_OUTFLOW_ROLES, STOCK_PRINCIPAL_ROLE, STOCK_WRITE_ROLES } from "../../lib/domain/inventory/stock-roles";
import {
  compraSchema,
  movimientoStockSchema,
  productoSchema,
  type Compra,
  type GestionError,
  type MovimientoStock,
  type Producto
} from "../data/schemas";
import { AuditRepository, buildAuditEvent } from "../handlers/audit";
import type { AuthActor, Role } from "../handlers/auth";
import { createGestionError, ERROR_CODES } from "../handlers/errors";
import { IdempotencyService } from "../handlers/idempotency";
import { err, ok, type Result } from "../handlers/result";
import type { PortActor } from "../ports/actor";
import type { StockAuditHook, StockRepositoryPort } from "../ports/stock";

export interface StockActor {
  hasGlobalAccess: boolean;
  id: string;
  role: Role;
}

export function toStockActor(auth: AuthActor): StockActor {
  return {
    hasGlobalAccess: auth.role === "administrador" || auth.role === "administrador_principal",
    id: auth.id,
    role: auth.role
  };
}

function toPortActor(actor: StockActor): PortActor {
  return { hasGlobalAccess: actor.hasGlobalAccess, id: actor.id };
}

export const stockListQuerySchema = z.object({
  productoId: z.string().min(1).max(100).optional(),
  deposito: z.string().trim().min(1).max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});

export type StockListQuery = z.infer<typeof stockListQuerySchema>;

export const compraListQuerySchema = z.object({
  q: z.string().max(120).optional(),
  proveedor: z.string().trim().min(1).max(120).optional(),
  productoId: z.string().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});

export type CompraListQuery = z.infer<typeof compraListQuerySchema>;

export const anularCompraInputSchema = z.object({
  motivo: z.string().min(1).max(200)
});

export type AnularCompraInput = z.infer<typeof anularCompraInputSchema>;

export interface CompraListItem {
  cantidad: number;
  comprobante?: string;
  costoUnitario: number;
  fecha: string;
  id: string;
  productoId: string;
  proveedor: string;
  total: number;
}

export interface CompraListResponse {
  items: CompraListItem[];
  page: number;
  pageSize: number;
  totalItems: number;
}

function toCompraListItem(compra: Compra): CompraListItem {
  return {
    cantidad: compra.cantidad,
    comprobante: compra.comprobante,
    costoUnitario: compra.costoUnitario,
    fecha: compra.fecha,
    id: compra.id,
    productoId: compra.productoId,
    proveedor: compra.proveedor,
    total: compra.total
  };
}

export interface StockLevelItem {
  balance: number;
  deposito: string;
  displayName: string;
  lowStock: boolean;
  minimum: number;
  productoId: string;
}

export interface StockLevelsResponse {
  items: StockLevelItem[];
  page: number;
  pageSize: number;
  totalItems: number;
}

export interface StockBalance {
  balance: number;
  deposito: string;
  minimum: number;
  productoId: string;
}

export class StockUseCases {
  private readonly audit: AuditRepository;
  private readonly idempotency: IdempotencyService;
  private readonly port: StockRepositoryPort;

  public constructor(
    port: StockRepositoryPort,
    audit: AuditRepository,
    idempotency: IdempotencyService
  ) {
    this.port = port;
    this.audit = audit;
    this.idempotency = idempotency;
  }

  public async getLevels(
    actor: StockActor,
    query: StockListQuery
  ): Promise<Result<StockLevelsResponse, GestionError>> {
    const portActor = toPortActor(actor);
    if (query.productoId !== undefined) {
      const single = await this.port.getProducto(portActor, query.productoId);
      if (!single.ok) return err(single.error);
      return this.levelsFor(portActor, [single.value.id], query);
    }
    const listed = await this.port.listProductos(portActor);
    if (!listed.ok) return err(listed.error);
    return this.levelsFor(
      portActor,
      listed.value.map((item) => item.id),
      query
    );
  }

  public async checkAvailability(    actor: StockActor,
    productoId: string,
    cantidad: number
  ): Promise<Result<StockBalance, GestionError>> {
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      return err(createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["cantidad"] }));
    }
    const producto = await this.port.getProducto(toPortActor(actor), productoId);
    if (!producto.ok) return err(producto.error);
    if (producto.value.stock < cantidad) {
      return err(createGestionError(ERROR_CODES.CONFLICT, { fields: ["cantidad"] }));
    }
    return ok({
      balance: producto.value.stock,
      deposito: DEPOSITS.PRINCIPAL,
      minimum: producto.value.minimum,
      productoId: producto.value.id
    });
  }

  public async listCompras(
    actor: StockActor,
    query: CompraListQuery
  ): Promise<Result<CompraListResponse, GestionError>> {
    if (!STOCK_WRITE_ROLES.has(actor.role)) return err(forbidden());
    const portActor = toPortActor(actor);
    const [compras, productos] = await Promise.all([
      this.port.listCompras(portActor),
      this.port.listProductos(portActor)
    ]);
    if (!compras.ok) return err(compras.error);
    if (!productos.ok) return err(productos.error);
    const names = new Map(productos.value.map((item) => [item.id, item.displayName]));
    const needle = query.q?.trim().toLowerCase();
    const filtered = compras.value.filter((compra) => {
      if (query.proveedor !== undefined && compra.proveedor.trim().toLowerCase() !== query.proveedor.toLowerCase()) {
        return false;
      }
      if (query.productoId !== undefined && compra.productoId !== query.productoId) return false;
      if (needle !== undefined && needle !== "") {
        const haystack = `${compra.proveedor} ${compra.comprobante ?? ""} ${names.get(compra.productoId) ?? ""}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
    const totalItems = filtered.length;
    const start = (query.page - 1) * query.pageSize;
    return ok({
      items: filtered.slice(start, start + query.pageSize).map(toCompraListItem),
      page: query.page,
      pageSize: query.pageSize,
      totalItems
    });
  }

  public async getCompraById(actor: StockActor, id: unknown): Promise<Result<CompraListItem, GestionError>> {
    if (typeof id !== "string" || id.trim() === "") {
      return err(createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["id"] }));
    }
    if (!STOCK_WRITE_ROLES.has(actor.role)) return err(forbidden());
    const found = await this.port.getCompra(toPortActor(actor), id);
    if (!found.ok) return err(found.error);
    return ok(toCompraListItem(found.value));
  }

  public async anularCompra(
    actor: StockActor,
    id: unknown,
    input: unknown,
    idempotencyKey: unknown
  ): Promise<Result<CompraListItem, GestionError>> {
    if (typeof id !== "string" || id.trim() === "") {
      return err(createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["id"] }));
    }
    const parsed = anularCompraInputSchema.safeParse(input);
    if (!parsed.success) return err(validationError(parsed.error.issues));
    if (!STOCK_WRITE_ROLES.has(actor.role)) return err(forbidden());
    return this.idempotency.execute<CompraListItem>(
      idempotencyKey,
      { id, motivo: parsed.data.motivo },
      () => this.anularCompraEffect(actor, id, parsed.data.motivo)
    );
  }

  private async anularCompraEffect(
    actor: StockActor,
    id: string,
    motivo: string
  ): Promise<Result<CompraListItem, GestionError>> {
    const portActor = toPortActor(actor);
    const found = await this.port.getCompra(portActor, id);
    if (!found.ok) return err(found.error);
    const compra = found.value;
    const producto = await this.port.getProducto(portActor, compra.productoId);
    if (!producto.ok) {
      return err(createGestionError(ERROR_CODES.CONFLICT, { fields: ["productoId"] }));
    }
    const movimientos = await this.port.listMovimientos(portActor, compra.productoId);
    if (!movimientos.ok) return err(movimientos.error);
    // Safe retry by reversal check: a compra with an anulacion reversal already
    // written returns as-is with no new movements (compra doc has no estado field,
    // so the reversal is the annulled marker). Assumption: reversal mirrors the
    // entry deposito (confirm at verify).
    const alreadyAnulled = movimientos.value.some(
      (move) => move.motivo === "anulacion" && move.referencia === compra.id
    );
    if (alreadyAnulled) return ok(toCompraListItem(compra));
    if (producto.value.stock < compra.cantidad) {
      return err(createGestionError(ERROR_CODES.CONFLICT, { fields: ["cantidad"] }));
    }
    const nextStock = producto.value.stock - compra.cantidad;
    const parsedProducto = productoSchema.safeParse({
      ...producto.value,
      stock: nextStock
    });
    if (!parsedProducto.success) {
      return err(validationError(parsedProducto.error.issues));
    }
    const nextProducto: Producto = { ...parsedProducto.data, version: producto.value.version + 1 };
    const parsedMovimiento = movimientoStockSchema.safeParse({
      balanceAfter: nextStock,
      cantidad: -compra.cantidad,
      deposito: compra.deposito,
      id: `m_${randomUUID()}`,
      motivo: "anulacion",
      ownerId: actor.id,
      productoId: compra.productoId,
      referencia: compra.id,
      version: 1
    });
    if (!parsedMovimiento.success) {
      return err(validationError(parsedMovimiento.error.issues));
    }
    // Shared movement mechanism: reuse applyOutflow persistence (producto +
    // movimiento) with a compra.anular audit hook instead of stock.outflow.
    const applied = await this.port.applyOutflow(
      portActor,
      { movimiento: parsedMovimiento.data, producto: nextProducto },
      this.auditHook(actor.id, "compra.anular", "compra", compra.id, {
        motivo,
        productoId: compra.productoId
      })
    );
    if (!applied.ok) return err(applied.error);
    return ok(toCompraListItem(compra));
  }

  public async recordOutflow(    actor: StockActor,
    input: unknown,
    idempotencyKey: unknown
  ): Promise<Result<{ movimiento: MovimientoStock; producto: Producto }, GestionError>> {
    const parsed = outflowInputSchema.safeParse(input);
    if (!parsed.success) return err(validationError(parsed.error.issues));
    if (!STOCK_OUTFLOW_ROLES.has(actor.role)) return err(forbidden());
    if (parsed.data.ajuste && actor.role !== STOCK_PRINCIPAL_ROLE) return err(forbidden());
    let effectRan = false;
    const result = await this.idempotency.execute<{ movimiento: MovimientoStock; producto: Producto }>(
      idempotencyKey,
      parsed.data,
      async () => {
        effectRan = true;
        return this.outflowEffect(actor, parsed.data);
      }
    );
    if (!result.ok && result.error.code === ERROR_CODES.CONFLICT && !effectRan) {
      return this.auditOutcome(actor.id, "stock.outflow", null, result);
    }
    return result;
  }

  public async transferPair(
    actor: StockActor,
    input: unknown,
    idempotencyKey: unknown
  ): Promise<Result<{ movimientos: [MovimientoStock, MovimientoStock] }, GestionError>> {
    const parsed = transferInputSchema.safeParse(input);
    if (!parsed.success) return err(validationError(parsed.error.issues));
    if (!STOCK_WRITE_ROLES.has(actor.role)) return err(forbidden());
    let effectRan = false;
    const result = await this.idempotency.execute<{ movimientos: [MovimientoStock, MovimientoStock] }>(
      idempotencyKey,
      parsed.data,
      async () => {
        effectRan = true;
        return this.transferEffect(actor, parsed.data);
      }
    );
    if (!result.ok && result.error.code === ERROR_CODES.CONFLICT && !effectRan) {
      return this.auditOutcome(actor.id, "stock.transfer", null, result);
    }
    return result;
  }

  public async recordPurchase(
    actor: StockActor,
    input: unknown,
    idempotencyKey: unknown
  ): Promise<Result<{ compra: Compra; movimiento: MovimientoStock; producto: Producto }, GestionError>> {
    const parsed = purchaseInputSchema.safeParse(input);
    if (!parsed.success) return err(validationError(parsed.error.issues));
    if (!STOCK_WRITE_ROLES.has(actor.role)) return err(forbidden());
    let effectRan = false;
    const result = await this.idempotency.execute<{
      compra: Compra;
      movimiento: MovimientoStock;
      producto: Producto;
    }>(idempotencyKey, parsed.data, async () => {
      effectRan = true;
      return this.purchaseEffect(actor, parsed.data);
    });
    if (!result.ok && result.error.code === ERROR_CODES.CONFLICT && !effectRan) {
      return this.auditOutcome(actor.id, "stock.purchase", null, result);
    }
    return result;
  }

  private async outflowEffect(
    actor: StockActor,
    data: OutflowInput
  ): Promise<Result<{ movimiento: MovimientoStock; producto: Producto }, GestionError>> {
    const portActor = toPortActor(actor);
    const found = await this.port.getProducto(portActor, data.productoId);
    if (!found.ok) return this.auditOutcome(actor.id, "stock.outflow", null, found);
    const planned = planOutflow(found.value.stock, data, data.ajuste);
    if (!planned.ok) return this.auditOutcome(actor.id, "stock.outflow", found.value.id, planned);
    const parsedProducto = productoSchema.safeParse({ ...found.value, stock: found.value.stock - data.cantidad });
    if (!parsedProducto.success) {
      return this.auditOutcome(actor.id, "stock.outflow", found.value.id, err(validationError(parsedProducto.error.issues)));
    }
    const nextProducto: Producto = { ...parsedProducto.data, version: found.value.version + 1 };
    const parsedMovimiento = movimientoStockSchema.safeParse({
      balanceAfter: planned.value.balanceAfter,
      cantidad: planned.value.cantidad,
      deposito: planned.value.deposito,
      id: `m_${randomUUID()}`,
      motivo: planned.value.motivo,
      ownerId: actor.id,
      productoId: found.value.id,
      referencia: data.ajuste ? "ajuste" : undefined,
      version: 1
    });
    if (!parsedMovimiento.success) {
      return this.auditOutcome(actor.id, "stock.outflow", found.value.id, err(validationError(parsedMovimiento.error.issues)));
    }
    return this.port.applyOutflow(
      portActor,
      { movimiento: parsedMovimiento.data, producto: nextProducto },
      this.auditHook(actor.id, "stock.outflow", "movimiento-stock", parsedMovimiento.data.id, { productoId: found.value.id })
    );
  }

  private async transferEffect(
    actor: StockActor,
    data: TransferInput
  ): Promise<Result<{ movimientos: [MovimientoStock, MovimientoStock] }, GestionError>> {
    const portActor = toPortActor(actor);
    const found = await this.port.getProducto(portActor, data.productoId);
    if (!found.ok) return this.auditOutcome(actor.id, "stock.transfer", null, found);
    const movimientos = await this.port.listMovimientos(portActor, data.productoId);
    if (!movimientos.ok) return this.auditOutcome(actor.id, "stock.transfer", found.value.id, movimientos);
    const balances = deriveBalances(movimientos.value);
    const principalKey = balanceKey(found.value.id, DEPOSITS.PRINCIPAL);
    if (!movimientos.value.some((move) => balanceKey(move.productoId, move.deposito) === principalKey)) {
      balances.set(principalKey, found.value.stock);
    }
    const pair = planTransferPair(balances, data);
    if (!pair.ok) return this.auditOutcome(actor.id, "stock.transfer", found.value.id, pair);
    const group = `t_${randomUUID()}`;
    const parsedMoves: MovimientoStock[] = [];
    for (const draft of [
      { ...pair.value.leaving, referencia: group },
      { ...pair.value.arriving, referencia: group }
    ]) {
      const candidate = movimientoStockSchema.safeParse({
        balanceAfter: draft.balanceAfter,
        cantidad: draft.cantidad,
        deposito: draft.deposito,
        id: `m_${randomUUID()}`,
        motivo: "transferencia",
        ownerId: actor.id,
        productoId: found.value.id,
        referencia: draft.referencia,
        version: 1
      });
      if (!candidate.success) {
        return this.auditOutcome(actor.id, "stock.transfer", found.value.id, err(validationError(candidate.error.issues)));
      }
      parsedMoves.push(candidate.data);
    }
    const [first, second] = parsedMoves;
    if (first === undefined || second === undefined) {
      return this.auditOutcome(actor.id, "stock.transfer", found.value.id, err(storageError()));
    }
    return this.port.applyTransferPair(
      portActor,
      { movimientos: [first, second] },
      this.auditHook(actor.id, "stock.transfer", "movimiento-stock", group, { productoId: found.value.id })
    );
  }

  private async purchaseEffect(
    actor: StockActor,
    data: PurchaseInput
  ): Promise<Result<{ compra: Compra; movimiento: MovimientoStock; producto: Producto }, GestionError>> {
    const portActor = toPortActor(actor);
    const found = await this.port.getProducto(portActor, data.productoId);
    if (!found.ok) return this.auditOutcome(actor.id, "stock.purchase", null, found);
    const cost = weightedAverageCost(found.value.stock, found.value.cost, data.cantidad, data.costoUnitario);
    const stock = found.value.stock + data.cantidad;
    const parsedProducto = productoSchema.safeParse({ ...found.value, cost, stock });
    if (!parsedProducto.success) {
      return this.auditOutcome(actor.id, "stock.purchase", found.value.id, err(validationError(parsedProducto.error.issues)));
    }
    const nextProducto: Producto = { ...parsedProducto.data, version: found.value.version + 1 };
    const compraId = `co_${randomUUID()}`;
    const parsedCompra = compraSchema.safeParse({
      cantidad: data.cantidad,
      costoUnitario: data.costoUnitario,
      comprobante: data.comprobante,
      deposito: data.deposito,
      fecha: new Date().toISOString(),
      id: compraId,
      ownerId: actor.id,
      productoId: found.value.id,
      proveedor: data.proveedor,
      total: Math.round(data.cantidad * data.costoUnitario * 100) / 100,
      version: 1
    });
    if (!parsedCompra.success) {
      return this.auditOutcome(actor.id, "stock.purchase", found.value.id, err(validationError(parsedCompra.error.issues)));
    }
    const parsedMovimiento = movimientoStockSchema.safeParse({
      balanceAfter: stock,
      cantidad: data.cantidad,
      deposito: data.deposito,
      id: `m_${randomUUID()}`,
      motivo: "compra",
      ownerId: actor.id,
      productoId: found.value.id,
      referencia: compraId,
      version: 1
    });
    if (!parsedMovimiento.success) {
      return this.auditOutcome(actor.id, "stock.purchase", found.value.id, err(validationError(parsedMovimiento.error.issues)));
    }
    return this.port.applyPurchase(
      portActor,
      { compra: parsedCompra.data, movimiento: parsedMovimiento.data, producto: nextProducto },
      this.auditHook(actor.id, "stock.purchase", "compra", compraId, { productoId: found.value.id })
    );
  }

  private auditHook(
    actorId: string,
    accion: string,
    entidad: string,
    entidadId: string | null,
    detalles: Record<string, unknown>
  ): StockAuditHook {
    return async () => {
      const appended = await this.audit.append(
        buildAuditEvent({ actorId, accion, entidad, entidadId, detalles }, "ok")
      );
      if (!appended.ok) return err(appended.error);
      return ok(undefined);
    };
  }

  private async auditOutcome<T>(
    actorId: string,
    accion: string,
    entidadId: string | null,
    outcome: Result<T, GestionError>
  ): Promise<Result<T, GestionError>> {
    const appended = await this.audit.append(
      buildAuditEvent(
        { actorId, accion, entidad: "stock", entidadId },
        outcome.ok ? "ok" : outcome.error.code
      )
    );
    if (!appended.ok) return err(appended.error);
    return outcome;
  }

  private async levelsFor(
    actor: PortActor,
    productoIds: string[],
    query: StockListQuery
  ): Promise<Result<StockLevelsResponse, GestionError>> {
    const [productos, movimientos] = await Promise.all([
      this.port.listProductos(actor),
      this.port.listMovimientos(actor)
    ]);
    if (!productos.ok) return err(productos.error);
    if (!movimientos.ok) return err(movimientos.error);
    const byId = new Map(productos.value.map((item) => [item.id, item]));
    const balances = deriveBalances(movimientos.value);
    const items: StockLevelItem[] = [];
    for (const id of productoIds) {
      const producto = byId.get(id);
      if (producto === undefined) return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
      const observed = new Set<string>([DEPOSITS.PRINCIPAL, DEPOSITS.TALLER]);
      for (const move of movimientos.value) {
        if (move.productoId === id && move.deposito !== undefined) observed.add(move.deposito);
      }
      for (const deposito of observed) {
        const balance =
          deposito === DEPOSITS.PRINCIPAL
            ? producto.stock
            : (balances.get(balanceKey(id, deposito)) ?? 0);
        items.push({
          balance,
          deposito,
          displayName: producto.displayName,
          lowStock: balance < producto.minimum,
          minimum: producto.minimum,
          productoId: id
        });
      }
    }
    items.sort((a, b) => a.productoId.localeCompare(b.productoId) || a.deposito.localeCompare(b.deposito));
    const filtered =
      query.deposito === undefined ? items : items.filter((item) => item.deposito === query.deposito);
    const totalItems = filtered.length;
    const start = (query.page - 1) * query.pageSize;
    return ok({
      items: filtered.slice(start, start + query.pageSize),
      page: query.page,
      pageSize: query.pageSize,
      totalItems
    });
  }
}

function validationError(issues: z.ZodIssue[]): GestionError {
  return createGestionError(ERROR_CODES.VALIDATION_ERROR, {
    fields: issues.map((issue) => issue.path.join("."))
  });
}

function forbidden(): GestionError {
  return createGestionError(ERROR_CODES.FORBIDDEN);
}

function storageError(): GestionError {
  return createGestionError(ERROR_CODES.STORAGE_ERROR);
}
