import { randomUUID } from "node:crypto";

import { z } from "zod";

import {
  balanceKey,
  DEPOSITS,
  deriveBalances,
  outflowInputSchema,
  planOutflow,
  type OutflowInput
} from "../../lib/domain/inventory/inventory";
import { STOCK_OUTFLOW_ROLES, STOCK_PRINCIPAL_ROLE } from "../../lib/domain/inventory/stock-roles";
import {
  movimientoStockSchema,
  productoSchema,
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

  public async checkAvailability(
    actor: StockActor,
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

  public async recordOutflow(
    actor: StockActor,
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
