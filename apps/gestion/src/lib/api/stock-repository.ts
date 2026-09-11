/**
 * Client-side repository for the Stock backend API.
 *
 * Reads the Bearer token from the global auth store and talks directly to
 * `/api/v1/stock-movements` for listing and creating movements.
 */

import { HttpClient } from "./http-client";
import type { ApiEnvelope } from "./http-client";
import { useAuthStore } from "./auth-store";

export type StockMovementType = "entrada" | "salida";

export interface StockMovement {
  readonly id: string;
  readonly productId: string;
  readonly movementType: StockMovementType;
  readonly quantity: number;
  readonly detail?: string;
  readonly createdAt: string;
}

export interface StockMovementListResponse {
  readonly items: readonly StockMovement[];
  readonly total: number;
}

export interface StockMovementListQuery {
  readonly productId?: string;
  readonly from?: string;
  readonly to?: string;
}

export interface CreateStockMovementPayload {
  readonly productId: string;
  readonly movementType: StockMovementType;
  readonly quantity: number;
  readonly detail?: string;
}

export class StockRepository {
  private readonly client: HttpClient;

  public constructor() {
    this.client = new HttpClient({
      getToken: () => useAuthStore.getState().token,
    });
  }

  public async list(
    query: StockMovementListQuery = {}
  ): Promise<ApiEnvelope<StockMovementListResponse>> {
    return this.client.request<StockMovementListResponse>("GET", "/stock-movements", {
      query: query as Record<string, string | number | undefined>,
    });
  }

  public async create(
    data: CreateStockMovementPayload
  ): Promise<ApiEnvelope<StockMovement>> {
    return this.client.request<StockMovement>("POST", "/stock-movements", { body: data });
  }
}

/** Singleton instance used by UI hooks. */
export const stockRepository = new StockRepository();
