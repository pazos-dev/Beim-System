import {
  DEPOSITS,
  outflowInputSchema,
  purchaseInputSchema,
  transferInputSchema
} from "../../lib/domain/inventory/inventory";
import { STOCK_OUTFLOW_ROLES, STOCK_PRINCIPAL_ROLE, STOCK_WRITE_ROLES } from "../../lib/domain/inventory/stock-roles";
import type { Compra, GestionError, MovimientoStock, Producto } from "../data/schemas";
import { AuditRepository } from "../shared/audit";
import { createGestionError, ERROR_CODES } from "../shared/errors";
import { IdempotencyService } from "../shared/idempotency";
import { err, ok, type Result } from "../shared/result";
import { reportAuditOutcome, toPortActor, type StockActor, type StockEffectDeps, type StockRepositoryPort } from "./stock-port";
import { fetchLevels, type StockLevelsResponse, type StockListQuery } from "./stock-levels";
import {
  anularCompraEffect,
  anularCompraInputSchema,
  compraListQuerySchema,
  getCompraItem,
  listComprasPage,
  purchaseEffect,
  type CompraListItem,
  type CompraListResponse,
  type CompraListQuery
} from "./stock-compras";
import { outflowEffect } from "./stock-outflow";
import { transferEffect } from "./stock-transfer";

// Import-stable front: the operations live in stock-levels, stock-compras,
// stock-outflow and stock-transfer; this facade keeps the public use-case API
// (validation, roles, idempotency) and delegates effects to those modules.
export { toStockActor, type StockActor } from "./stock-port";
export {
  stockListQuerySchema,
  type StockLevelItem,
  type StockLevelsResponse,
  type StockListQuery
} from "./stock-levels";
export {
  anularCompraInputSchema,
  compraListQuerySchema,
  type AnularCompraInput,
  type CompraListItem,
  type CompraListResponse,
  type CompraListQuery
} from "./stock-compras";

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
      return fetchLevels(this.port, portActor, [single.value.id], query);
    }
    const listed = await this.port.listProductos(portActor);
    if (!listed.ok) return err(listed.error);
    return fetchLevels(
      this.port,
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
    return listComprasPage(this.deps(), actor, query);
  }

  public async getCompraById(actor: StockActor, id: unknown): Promise<Result<CompraListItem, GestionError>> {
    if (typeof id !== "string" || id.trim() === "") {
      return err(createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["id"] }));
    }
    return getCompraItem(this.deps(), actor, id);
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
    if (!parsed.success) return err(createGestionError(ERROR_CODES.VALIDATION_ERROR, {
      fields: parsed.error.issues.map((issue) => issue.path.join("."))
    }));
    if (!STOCK_WRITE_ROLES.has(actor.role)) return err(createGestionError(ERROR_CODES.FORBIDDEN));
    return this.idempotency.execute<CompraListItem>(
      idempotencyKey,
      { id, motivo: parsed.data.motivo },
      () => anularCompraEffect(this.deps(), actor, id, parsed.data.motivo)
    );
  }

  public async recordOutflow(    actor: StockActor,
    input: unknown,
    idempotencyKey: unknown
  ): Promise<Result<{ movimiento: MovimientoStock; producto: Producto }, GestionError>> {
    const parsed = outflowInputSchema.safeParse(input);
    if (!parsed.success) return err(createGestionError(ERROR_CODES.VALIDATION_ERROR, {
      fields: parsed.error.issues.map((issue) => issue.path.join("."))
    }));
    if (!STOCK_OUTFLOW_ROLES.has(actor.role)) return err(createGestionError(ERROR_CODES.FORBIDDEN));
    if (parsed.data.ajuste && actor.role !== STOCK_PRINCIPAL_ROLE) return err(createGestionError(ERROR_CODES.FORBIDDEN));
    let effectRan = false;
    const result = await this.idempotency.execute<{ movimiento: MovimientoStock; producto: Producto }>(
      idempotencyKey,
      parsed.data,
      async () => {
        effectRan = true;
        return outflowEffect(this.deps(), actor, parsed.data);
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
    if (!parsed.success) return err(createGestionError(ERROR_CODES.VALIDATION_ERROR, {
      fields: parsed.error.issues.map((issue) => issue.path.join("."))
    }));
    if (!STOCK_WRITE_ROLES.has(actor.role)) return err(createGestionError(ERROR_CODES.FORBIDDEN));
    let effectRan = false;
    const result = await this.idempotency.execute<{ movimientos: [MovimientoStock, MovimientoStock] }>(
      idempotencyKey,
      parsed.data,
      async () => {
        effectRan = true;
        return transferEffect(this.deps(), actor, parsed.data);
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
    if (!parsed.success) return err(createGestionError(ERROR_CODES.VALIDATION_ERROR, {
      fields: parsed.error.issues.map((issue) => issue.path.join("."))
    }));
    if (!STOCK_WRITE_ROLES.has(actor.role)) return err(createGestionError(ERROR_CODES.FORBIDDEN));
    let effectRan = false;
    const result = await this.idempotency.execute<{
      compra: Compra;
      movimiento: MovimientoStock;
      producto: Producto;
    }>(idempotencyKey, parsed.data, async () => {
      effectRan = true;
      return purchaseEffect(this.deps(), actor, parsed.data);
    });
    if (!result.ok && result.error.code === ERROR_CODES.CONFLICT && !effectRan) {
      return this.auditOutcome(actor.id, "stock.purchase", null, result);
    }
    return result;
  }

  private deps(): StockEffectDeps {
    return { audit: this.audit, port: this.port };
  }

  private async auditOutcome<T>(
    actorId: string,
    accion: string,
    entidadId: string | null,
    outcome: Result<T, GestionError>
  ): Promise<Result<T, GestionError>> {
    return reportAuditOutcome(this.audit, actorId, accion, entidadId, outcome);
  }
}
