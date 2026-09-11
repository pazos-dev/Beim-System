/**
 * Repositorio de compras que consume la API backend real.
 *
 * El backend expone /api/v1/purchases con un modelo comprimido:
 * - supplierName: nombre del proveedor.
 * - data: campo libre donde el frontend persiste el detalle de la compra
 *   (producto, cantidad, costo unitario, comprobante, etc.).
 */

import { HttpClient } from "./http-client";
import type { ApiEnvelope } from "./http-client";
import { useAuthStore } from "./auth-store";

export type { ApiEnvelope };

export interface Purchase {
  readonly id: string;
  readonly supplierName: string;
  readonly data?: unknown;
  readonly active?: boolean;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

export interface PurchaseListResponse {
  readonly items: readonly Purchase[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

export interface PurchaseListQuery {
  readonly active?: string;
  readonly page?: number;
  readonly limit?: number;
  readonly supplierName?: string;
  readonly productId?: string;
  readonly q?: string;
  readonly [key: string]: string | number | undefined;
}

export interface CreatePurchasePayload {
  readonly supplierName: string;
  readonly data?: unknown;
}

export interface UpdatePurchasePayload {
  readonly supplierName?: string;
  readonly data?: unknown;
  readonly active?: boolean;
}

/**
 * Client-side repository for the Purchases backend API.
 *
 * Authentication is read from the global auth store; the HttpClient turns it
 * into a Bearer header on every request.
 */
export class CompraRepository {
  private readonly client: HttpClient;

  public constructor() {
    this.client = new HttpClient({
      getToken: () => useAuthStore.getState().token,
    });
  }

  public async list(query: PurchaseListQuery = {}): Promise<ApiEnvelope<PurchaseListResponse>> {
    // Backend /purchases only accepts 'active' (true/false/all).
    // Other filters (page, limit, q, supplierName, productId) are applied client-side.
    const backendQuery: { active?: string } = {};
    if (query.active !== undefined && query.active !== "") {
      backendQuery.active = query.active;
    }

    const envelope = await this.client.request<readonly Purchase[]>("GET", "/purchases", { query: backendQuery });
    if (!envelope.ok) {
      return envelope as unknown as ApiEnvelope<PurchaseListResponse>;
    }

    const all = envelope.data ?? [];
    const search = (query.q ?? "").trim().toLowerCase();
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.max(1, query.limit ?? 25);

    const filtered = all.filter((purchase) => {
      if (search !== "" && !purchase.supplierName.toLowerCase().includes(search)) return false;
      return true;
    });

    const total = filtered.length;
    const start = (page - 1) * limit;
    const items = filtered.slice(start, start + limit);

    return { ok: true, data: { items, limit, page, total } };
  }

  public async create(data: CreatePurchasePayload): Promise<ApiEnvelope<Purchase>> {
    return this.client.request<Purchase>("POST", "/purchases", { body: data });
  }

  public async update(id: string, data: UpdatePurchasePayload): Promise<ApiEnvelope<Purchase>> {
    return this.client.request<Purchase>("PUT", `/purchases/${encodeURIComponent(id)}`, { body: data });
  }
}

/** Singleton instance used by UI hooks. */
export const compraRepository = new CompraRepository();
