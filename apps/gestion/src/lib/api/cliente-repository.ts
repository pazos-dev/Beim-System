import { HttpClient } from "./http-client";
import type { ApiEnvelope } from "./http-client";
import { useAuthStore } from "./auth-store";

export type { ApiEnvelope };

export interface Cliente {
  readonly id: string;
  readonly name: string;
  readonly email?: string;
  readonly phone?: string;
  readonly active: boolean;
}

export interface ClienteListResponse {
  readonly items: readonly Cliente[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

export interface ClienteListQuery {
  readonly search?: string;
  readonly active?: string;
  readonly page?: number;
  readonly limit?: number;
  [key: string]: string | number | undefined;
}

export type CreateClientePayload = {
  readonly name: string;
  readonly email?: string;
  readonly phone?: string;
};

export type UpdateClientePayload = {
  readonly name?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly active?: boolean;
};

/**
 * Client-side repository for the Clients backend API.
 *
 * Authentication is read from the global auth store; the HttpClient turns it
 * into a Bearer header on every request.
 */
export class ClienteRepository {
  private readonly client: HttpClient;

  public constructor() {
    this.client = new HttpClient({
      getToken: () => useAuthStore.getState().token,
    });
  }

  public async list(query: ClienteListQuery): Promise<ApiEnvelope<ClienteListResponse>> {
    return this.client.request<ClienteListResponse>("GET", "/clients", { query });
  }

  public async create(data: CreateClientePayload): Promise<ApiEnvelope<Cliente>> {
    return this.client.request<Cliente>("POST", "/clients", { body: data });
  }

  public async update(id: string, data: UpdateClientePayload): Promise<ApiEnvelope<Cliente>> {
    return this.client.request<Cliente>("PUT", `/clients/${encodeURIComponent(id)}`, { body: data });
  }
}

/** Singleton instance used by UI hooks. */
export const clienteRepository = new ClienteRepository();
