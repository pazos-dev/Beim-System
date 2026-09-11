/**
 * Client-side repository for the Ventas/Receipts backend API.
 *
 * Wraps the real backend endpoints under `/api/v1/receipts` and
 * `/api/v1/sales-batch`. Authentication is read from the global auth store;
 * the HttpClient turns it into a Bearer header on every request.
 */

import { HttpClient } from "./http-client";
import type { ApiEnvelope } from "./http-client";
import { useAuthStore } from "./auth-store";

export type { ApiEnvelope };

export type VentaEstado = "confirmada" | "anulada" | "devuelta";
export type OrderPaymentStatus = "pendiente" | "parcial" | "pagado";

export interface Venta {
  readonly id: string;
  readonly numero: string;
  // Sale status (`confirmada`/`anulada`) or order state token.
  readonly estado: string;
  readonly total: number;
  readonly version: number;
  readonly fecha?: string;
  // Order-related fields returned when the receipt represents a repair order.
  readonly clienteId?: string;
  readonly clienteNombre?: string;
  readonly equipment?: string;
  readonly estimatedDisplay?: string;
  readonly paymentStatus?: string;
  readonly boletaNumero?: string;
  readonly ordenId?: string;
}

export interface VentaListResponse {
  readonly items: readonly Venta[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

export interface VentaListQuery {
  readonly client?: string;
  readonly paymentMethod?: string;
  readonly from?: string;
  readonly to?: string;
  readonly page?: number;
  readonly limit?: number;
  // Filter by receipt type (`sale` vs `order`) or status. The backend may
  // ignore unsupported params; the repository forwards them verbatim.
  readonly type?: "sale" | "order";
  readonly status?: string;
  readonly [key: string]: string | number | undefined;
}

export interface CreateVentaPayload {
  readonly clientName: string;
  readonly clientId: string;
  readonly items: ReadonlyArray<{ readonly productId: string; readonly quantity: number }>;
  readonly payments?: ReadonlyArray<{ readonly method: string; readonly amount: number }>;
  readonly numero?: string;
  readonly ordenId?: string;
}

export interface CreateOrderPayload {
  readonly clientName: string;
  readonly clientId?: string;
  readonly clientPhone?: string;
  readonly deviceBrand?: string;
  readonly deviceModel?: string;
  readonly deviceColor?: string;
  readonly imeiSerial?: string;
  readonly reportedIssue?: string;
  readonly services?: ReadonlyArray<string>;
  readonly repairStatus?: string;
  readonly quoteTotal?: number;
  readonly paymentStatus?: string;
}

export interface NextNumberResponse {
  readonly nextNumber: string;
}

export class VentaRepository {
  private readonly client: HttpClient;

  public constructor() {
    this.client = new HttpClient({
      getToken: () => useAuthStore.getState().token,
    });
  }

  public async list(query: VentaListQuery = {}): Promise<ApiEnvelope<VentaListResponse>> {
    return this.client.request<VentaListResponse>("GET", "/receipts", { query });
  }

  public async create(data: CreateVentaPayload): Promise<ApiEnvelope<Venta>> {
    return this.client.request<Venta>("POST", "/sales-batch", { body: data });
  }

  public async createOrder(data: CreateOrderPayload): Promise<ApiEnvelope<Venta>> {
    return this.client.request<Venta>("POST", "/receipts", { body: data });
  }

  public async annul(id: string): Promise<ApiEnvelope<void>> {
    return this.client.request<void>("POST", `/receipts/${encodeURIComponent(id)}/annul`, { body: {} });
  }

  public async getById(id: string): Promise<ApiEnvelope<Venta>> {
    return this.client.request<Venta>("GET", `/receipts/${encodeURIComponent(id)}`);
  }

  public async nextNumber(): Promise<ApiEnvelope<NextNumberResponse>> {
    return this.client.request<NextNumberResponse>("GET", "/receipts/next-number");
  }
}

/** Singleton instance used by UI hooks. */
export const ventaRepository = new VentaRepository();
