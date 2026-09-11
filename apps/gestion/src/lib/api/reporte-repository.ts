/**
 * Repositorio de reportes que consume la API backend directamente.
 *
 * Expone un método por endpoint de reportes definido en el contrato de backend.
 * Todos los métodos leen el token Bearer desde el auth store y desempaquetan
 * el envelope que devuelve HttpClient.
 */

import { HttpClient } from "./http-client";
import { useAuthStore } from "./auth-store";

const client = new HttpClient({
  getToken: () => useAuthStore.getState().token,
});

function unwrap<T>(
  envelope:
    | { readonly ok: true; readonly data?: T }
    | { readonly ok: false; readonly error?: { readonly message?: string } },
): T {
  if (!envelope.ok) {
    throw new Error(envelope.error?.message ?? "Error desconocido");
  }
  if (envelope.data === undefined) {
    throw new Error("Respuesta vacía del servidor");
  }
  return envelope.data;
}

export interface SalesSummary {
  readonly totalSales: number;
  readonly ticketCount: number;
  readonly averageTicket: number;
  readonly dailySeries: ReadonlyArray<{
    readonly date: string;
    readonly sales: number;
    readonly count: number;
  }>;
}

export interface CashSummary {
  readonly netByType: {
    readonly ingreso: number;
    readonly egreso: number;
    readonly ajuste: number;
  };
  readonly sessions: ReadonlyArray<{
    readonly date: string;
    readonly difference: number;
  }>;
}

export interface StockValuationItem {
  readonly productId: string;
  readonly name: string;
  readonly stock: number;
  readonly price: number;
  readonly valuation: number;
  readonly lowStock: boolean;
}

export interface StockValuation {
  readonly items: ReadonlyArray<StockValuationItem>;
  readonly total: number;
}

export interface TopProduct {
  readonly productId: string;
  readonly name: string;
  readonly quantity: number;
  readonly revenue: number;
}

export interface TopProducts {
  readonly byQuantity: ReadonlyArray<TopProduct>;
  readonly byRevenue: ReadonlyArray<TopProduct>;
}

export interface RepairsByStatus {
  readonly counts: {
    readonly Ingresado: number;
    readonly EnReparacion: number;
    readonly Listo: number;
    readonly Entregado: number;
    readonly Cancelado: number;
  };
}

export interface ReportFilters {
  readonly from: string;
  readonly to: string;
  readonly limit?: number;
}

export async function getSalesSummary(
  filters: Pick<ReportFilters, "from" | "to">,
): Promise<SalesSummary> {
  const envelope = await client.request<SalesSummary>("GET", "/reports/sales-summary", {
    query: { from: filters.from, to: filters.to },
  });
  return unwrap(envelope);
}

export async function getCashSummary(
  filters: Pick<ReportFilters, "from" | "to">,
): Promise<CashSummary> {
  const envelope = await client.request<CashSummary>("GET", "/reports/cash-summary", {
    query: { from: filters.from, to: filters.to },
  });
  return unwrap(envelope);
}

export async function getStockValuation(): Promise<StockValuation> {
  const envelope = await client.request<StockValuation>("GET", "/reports/stock-valuation");
  return unwrap(envelope);
}

export async function getTopProducts(filters: ReportFilters): Promise<TopProducts> {
  const envelope = await client.request<TopProducts>("GET", "/reports/top-products", {
    query: { from: filters.from, to: filters.to, limit: filters.limit },
  });
  return unwrap(envelope);
}

export async function getRepairsByStatus(): Promise<RepairsByStatus> {
  const envelope = await client.request<RepairsByStatus>("GET", "/reports/repairs-by-status");
  return unwrap(envelope);
}
