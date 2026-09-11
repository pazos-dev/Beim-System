/**
 * Client-side repository for the Servicios backend API.
 *
 * Authentication is read from the global auth store; the HttpClient turns it
 * into a Bearer header on every request.
 */

import { HttpClient } from "./http-client";
import type { ApiEnvelope } from "./http-client";
import { useAuthStore } from "./auth-store";

export type { ApiEnvelope };

export interface Servicio {
  readonly id: string;
  readonly displayName: string;
  readonly price: number;
  readonly active: boolean;
  readonly version: number;
}

export interface ServicioListResponse {
  readonly items: readonly Servicio[];
  readonly totalItems: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface ServicioListQuery {
  readonly active?: "true" | "false" | "all";
  readonly q?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export type CreateServicioPayload = {
  readonly displayName: string;
  readonly price: number;
  readonly active?: boolean;
};

export type UpdateServicioPayload = {
  readonly displayName?: string;
  readonly price?: number;
  readonly active?: boolean;
};

const DEFAULT_PAGE_SIZE = 25;

export class ServicioRepository {
  private readonly client: HttpClient;

  public constructor() {
    this.client = new HttpClient({
      getToken: () => useAuthStore.getState().token,
    });
  }

  public async list(query: ServicioListQuery = {}): Promise<ApiEnvelope<ServicioListResponse>> {
    const envelope = await this.client.request<readonly Servicio[]>("GET", "/services");
    if (!envelope.ok) {
      return envelope as unknown as ApiEnvelope<ServicioListResponse>;
    }

    const all = envelope.data ?? [];
    const active = query.active ?? "true";
    const search = (query.q ?? "").trim().toLowerCase();
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE);

    const filtered = all.filter((servicio) => {
      if (active !== "all" && servicio.active !== (active === "true")) return false;
      if (search !== "" && !servicio.displayName.toLowerCase().includes(search)) return false;
      return true;
    });

    const totalItems = filtered.length;
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize);

    return {
      ok: true,
      data: { items, page, pageSize, totalItems },
    };
  }

  public async create(data: CreateServicioPayload): Promise<ApiEnvelope<Servicio>> {
    return this.client.request<Servicio>("POST", "/services", { body: data });
  }

  public async update(
    id: string,
    data: UpdateServicioPayload & { expectedVersion: number }
  ): Promise<ApiEnvelope<Servicio>> {
    return this.client.request<Servicio>("PATCH", `/services/${encodeURIComponent(id)}`, { body: data });
  }
}

/** Singleton instance used by UI hooks. */
export const servicioRepository = new ServicioRepository();
