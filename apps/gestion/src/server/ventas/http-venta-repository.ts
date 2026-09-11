import { z } from "zod";

import {
  ventaSchema,
  type GestionError,
  type Venta
} from "../data/schemas";
import { createGestionError, ERROR_CODES } from "../shared/errors";
import { err, type Result } from "../shared/result";
import type { PortActor } from "../shared/actor";
import type {
  VentaAnularInput,
  VentaAuditHook,
  VentaCreateInput,
  VentaRepositoryPort
} from "./ventas-port";
import { GestionHttpClient, type GestionHttpFetch } from "../api/http-client";

const ventaListSchema = z.array(ventaSchema);

const PLACEHOLDER_MESSAGES = {
  create: "Próxima implementación: comando remoto de sales-batch aún no definido.",
  anular: "Próxima implementación: comando remoto de anulación aún no definido."
} as const;

export interface HttpVentaRepositoryConfig {
  baseUrl: string;
  token: string;
  fetchImpl?: GestionHttpFetch;
}

/**
 * Remote Venta adapter behind `VentaRepositoryPort`. Reads route through the
 * archived `/api/v1/receipts` resource conventions; mutations are deferred
 * because the remote sales-batch/annul command contract is not yet available.
 *
 * The actor is represented only by the configured bearer token. No actor id,
 * role or owner id is sent as authorization, and no local JSON store is used.
 */
export class HttpVentaRepository implements VentaRepositoryPort {
  private readonly client: GestionHttpClient;

  public constructor(config: HttpVentaRepositoryConfig) {
    this.client = new GestionHttpClient(config);
  }

  public async list(_actor: PortActor): Promise<Result<Venta[], GestionError>> {
    return this.client.request("GET", "/api/v1/receipts", { dataSchema: ventaListSchema });
  }

  public async getById(_actor: PortActor, id: string): Promise<Result<Venta, GestionError>> {
    return this.client.request("GET", `/api/v1/receipts/${encodeURIComponent(id)}`, {
      dataSchema: ventaSchema
    });
  }

  public async applyCreate(
    _actor: PortActor,
    _input: VentaCreateInput,
    _audit: VentaAuditHook
  ): Promise<Result<Venta, GestionError>> {
    return err(createGestionError(ERROR_CODES.DEPENDENCY_UNAVAILABLE, undefined, PLACEHOLDER_MESSAGES.create));
  }

  public async applyAnular(
    _actor: PortActor,
    _input: VentaAnularInput,
    _audit: VentaAuditHook
  ): Promise<Result<Venta, GestionError>> {
    return err(createGestionError(ERROR_CODES.DEPENDENCY_UNAVAILABLE, undefined, PLACEHOLDER_MESSAGES.anular));
  }
}
