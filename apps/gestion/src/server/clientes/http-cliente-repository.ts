import { z } from "zod";

import {
  clienteSchema,
  type Cliente,
  type GestionError
} from "../data/schemas";
import { createGestionError, ERROR_CODES } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";
import type { PortActor } from "../shared/actor";
import type { ClienteRepositoryPort } from "./cliente-port";
import {
  GestionHttpClient,
  type GestionHttpFetch
} from "../api/http-client";

const clienteListSchema = z.array(clienteSchema);

/** Fields the remote owns or stamps: excluded from request bodies. */
interface ClienteWritePayload {
  displayName: string;
  document?: string;
  phone?: string;
  email?: string;
  active: boolean;
}

function toWritePayload(entity: Cliente): ClienteWritePayload {
  const payload: ClienteWritePayload = {
    displayName: entity.displayName,
    active: entity.active
  };
  if (entity.document !== undefined) payload.document = entity.document;
  if (entity.phone !== undefined) payload.phone = entity.phone;
  if (entity.email !== undefined) payload.email = entity.email;
  return payload;
}

export interface HttpClienteRepositoryConfig {
  baseUrl: string;
  token: string;
  fetchImpl?: GestionHttpFetch;
}

/**
 * Remote Cliente adapter behind `ClienteRepositoryPort`. The actor is
 * represented only by the configured bearer token; `ownerId`, `id` and
 * `version` are server-stamped and never sent as body authority. Updates
 * carry `expectedVersion` per the frozen OCC convention.
 */
export class HttpClienteRepository implements ClienteRepositoryPort {
  private readonly client: GestionHttpClient;

  public constructor(config: HttpClienteRepositoryConfig) {
    this.client = new GestionHttpClient(config);
  }

  public async list(_actor: PortActor): Promise<Result<Cliente[], GestionError>> {
    return this.client.request("GET", "/api/v1/clients", { dataSchema: clienteListSchema });
  }

  public async getById(_actor: PortActor, id: string): Promise<Result<Cliente, GestionError>> {
    return this.client.request("GET", `/api/v1/clients/${encodeURIComponent(id)}`, {
      dataSchema: clienteSchema
    });
  }

  public async create(_actor: PortActor, input: unknown): Promise<Result<Cliente, GestionError>> {
    const parsed = clienteSchema.safeParse(input);
    if (!parsed.success) return err(createGestionError(ERROR_CODES.VALIDATION_ERROR));
    return this.client.request("POST", "/api/v1/clients", {
      body: toWritePayload(parsed.data),
      dataSchema: clienteSchema
    });
  }

  public async update(
    _actor: PortActor,
    id: string,
    patch: unknown,
    expectedVersion: number
  ): Promise<Result<Cliente, GestionError>> {
    const parsed = clienteSchema.safeParse(patch);
    if (!parsed.success) return err(createGestionError(ERROR_CODES.VALIDATION_ERROR));
    return this.client.request("PATCH", `/api/v1/clients/${encodeURIComponent(id)}`, {
      body: { ...toWritePayload(parsed.data), expectedVersion },
      dataSchema: clienteSchema
    });
  }

  public async remove(_actor: PortActor, id: string): Promise<Result<void, GestionError>> {
    const removed = await this.client.request<unknown>(
      "DELETE",
      `/api/v1/clients/${encodeURIComponent(id)}`
    );
    if (!removed.ok) return err(removed.error);
    return ok(undefined);
  }
}
