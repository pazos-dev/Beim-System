import { z } from "zod";

import {
  compraSchema,
  movimientoStockSchema,
  productoSchema,
  type Compra,
  type GestionError,
  type MovimientoStock,
  type Producto
} from "../data/schemas";
import { createGestionError, ERROR_CODES } from "../shared/errors";
import { err, type Result } from "../shared/result";
import type { PortActor } from "../shared/actor";
import type { StockAuditHook, StockRepositoryPort } from "./stock-port";
import { GestionHttpClient, type GestionHttpFetch } from "../api/http-client";

const productoListSchema = z.array(productoSchema);
const movimientoStockListSchema = z.array(movimientoStockSchema);
const compraListSchema = z.array(compraSchema);

const PLACEHOLDER_MESSAGES = {
  outflow: "Próxima implementación: comando remoto de egreso de stock aún no definido.",
  transfer: "Próxima implementación: comando remoto de transferencia de stock aún no definido.",
  purchase: "Próxima implementación: comando remoto de compra aún no definido."
} as const;

export interface HttpStockRepositoryConfig {
  baseUrl: string;
  token: string;
  fetchImpl?: GestionHttpFetch;
}

/**
 * Remote Stock adapter behind `StockRepositoryPort`. Reads route through the
 * documented plural resource conventions; mutations are deferred because the
 * port input carries server-stamped entities (`id`, `ownerId`, `version`) and
 * the remote command contract is not yet available.
 *
 * The actor is represented only by the configured bearer token. No actor id,
 * role or owner id is sent as authorization, and no local JSON store is used.
 */
export class HttpStockRepository implements StockRepositoryPort {
  private readonly client: GestionHttpClient;

  public constructor(config: HttpStockRepositoryConfig) {
    this.client = new GestionHttpClient(config);
  }

  public async listProductos(_actor: PortActor): Promise<Result<Producto[], GestionError>> {
    return this.client.request("GET", "/api/v1/stock", { dataSchema: productoListSchema });
  }

  public async getProducto(_actor: PortActor, id: string): Promise<Result<Producto, GestionError>> {
    return this.client.request("GET", `/api/v1/stock/${encodeURIComponent(id)}`, {
      dataSchema: productoSchema
    });
  }

  public async listMovimientos(
    _actor: PortActor,
    productoId?: string
  ): Promise<Result<MovimientoStock[], GestionError>> {
    const search = new URLSearchParams();
    if (productoId !== undefined) {
      search.set("productoId", productoId);
    }
    const query = search.toString();
    const path = query ? `/api/v1/stock/movements?${query}` : "/api/v1/stock/movements";
    return this.client.request("GET", path, { dataSchema: movimientoStockListSchema });
  }

  public async listCompras(_actor: PortActor): Promise<Result<Compra[], GestionError>> {
    return this.client.request("GET", "/api/v1/purchases", { dataSchema: compraListSchema });
  }

  public async getCompra(_actor: PortActor, id: string): Promise<Result<Compra, GestionError>> {
    return this.client.request("GET", `/api/v1/purchases/${encodeURIComponent(id)}`, {
      dataSchema: compraSchema
    });
  }

  public async applyOutflow(
    _actor: PortActor,
    _input: { movimiento: MovimientoStock; producto: Producto },
    _audit: StockAuditHook
  ): Promise<Result<{ movimiento: MovimientoStock; producto: Producto }, GestionError>> {
    return err(createGestionError(ERROR_CODES.DEPENDENCY_UNAVAILABLE, undefined, PLACEHOLDER_MESSAGES.outflow));
  }

  public async applyTransferPair(
    _actor: PortActor,
    _input: { movimientos: readonly [MovimientoStock, MovimientoStock] },
    _audit: StockAuditHook
  ): Promise<Result<{ movimientos: [MovimientoStock, MovimientoStock] }, GestionError>> {
    return err(createGestionError(ERROR_CODES.DEPENDENCY_UNAVAILABLE, undefined, PLACEHOLDER_MESSAGES.transfer));
  }

  public async applyPurchase(
    _actor: PortActor,
    _input: { compra: Compra; movimiento: MovimientoStock; producto: Producto },
    _audit: StockAuditHook
  ): Promise<Result<{ compra: Compra; movimiento: MovimientoStock; producto: Producto }, GestionError>> {
    return err(createGestionError(ERROR_CODES.DEPENDENCY_UNAVAILABLE, undefined, PLACEHOLDER_MESSAGES.purchase));
  }
}
