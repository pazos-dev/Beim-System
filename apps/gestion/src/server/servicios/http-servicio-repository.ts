import { z } from "zod";

import {
  servicioSchema,
  type GestionError,
  type Servicio
} from "../data/schemas";
import { createGestionError, ERROR_CODES } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";
import type { PortActor } from "../shared/actor";
import type { ServicioRepositoryPort } from "./servicio-port";
import {
  GestionHttpClient,
  type GestionHttpFetch
} from "../api/http-client";

const servicioListSchema = z.array(servicioSchema);

/** Fields the remote owns or stamps: excluded from request bodies. */
interface ServicioWritePayload {
  displayName: string;
  price: number;
  active: boolean;
}

function toWritePayload(entity: Servicio): ServicioWritePayload {
  return {
    displayName: entity.displayName,
    price: entity.price,
    active: entity.active
  };
}

export interface HttpServicioRepositoryConfig {
  baseUrl: string;
  token: string;
  fetchImpl?: GestionHttpFetch;
}

/**
 * Remote Servicio adapter behind `ServicioRepositoryPort`. The actor is
 * represented only by the configured bearer token; `ownerId`, `id` and
 * `version` are server-stamped and never sent as body authority. Updates
 * carry `expectedVersion` per the frozen OCC convention.
 */
export class HttpServicioRepository implements ServicioRepositoryPort {
  private readonly client: GestionHttpClient;

  public constructor(config: HttpServicioRepositoryConfig) {
    this.client = new GestionHttpClient(config);
  }

  public async list(_actor: PortActor): Promise<Result<Servicio[], GestionError>> {
    return this.client.request("GET", "/api/v1/services", { dataSchema: servicioListSchema });
  }

  public async getById(_actor: PortActor, id: string): Promise<Result<Servicio, GestionError>> {
    return this.client.request("GET", `/api/v1/services/${encodeURIComponent(id)}`, {
      dataSchema: servicioSchema
    });
  }

  public async create(_actor: PortActor, input: unknown): Promise<Result<Servicio, GestionError>> {
    const parsed = servicioSchema.safeParse(input);
    if (!parsed.success) return err(createGestionError(ERROR_CODES.VALIDATION_ERROR));
    return this.client.request("POST", "/api/v1/services", {
      body: toWritePayload(parsed.data),
      dataSchema: servicioSchema
    });
  }

  public async update(
    _actor: PortActor,
    id: string,
    patch: unknown,
    expectedVersion: number
  ): Promise<Result<Servicio, GestionError>> {
    const parsed = servicioSchema.safeParse(patch);
    if (!parsed.success) return err(createGestionError(ERROR_CODES.VALIDATION_ERROR));
    return this.client.request("PATCH", `/api/v1/services/${encodeURIComponent(id)}`, {
      body: { ...toWritePayload(parsed.data), expectedVersion },
      dataSchema: servicioSchema
    });
  }
}
