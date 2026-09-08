import { z } from "zod";

import type {
  PeriodSnapshot,
  SalesApiExtras,
  SalesDayPoint,
  SalesMethodPoint
} from "../../lib/domain/reports/reports";
import type { GestionError } from "../data/schemas";
import { createGestionError, ERROR_CODES } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";

/** Minimal fetch surface (ISP): only what the repository needs, mockable. */
export interface SalesSummaryHttpFetch {
  (url: string, init: { headers: Record<string, string> }): Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
  }>;
}

export interface HttpSalesSummaryRepositoryConfig {
  baseUrl: string;
  token: string;
  fetchImpl?: SalesSummaryHttpFetch;
}

export interface SalesSummaryQuery {
  desde: string;
  hasta: string;
}

export interface SalesSummary {
  from: string;
  to: string;
  totalSales: number;
  ticketCount: number;
  averageTicket: number;
  byDay: SalesDayPoint[];
  byMethod: SalesMethodPoint[];
}

const salesDaySchema = z.object({
  date: z.string().min(1),
  total: z.number(),
  count: z.number().int()
});

const salesMethodSchema = z.object({
  method: z.string().min(1),
  total: z.number(),
  count: z.number().int()
});

// Console contract: 200 { ok:true, data:{ from, to, totalSales, ticketCount,
// averageTicket, byDay (zero-filled), byMethod (reversals net) }}.
// Any shape mismatch fails closed with DEPENDENCY_UNAVAILABLE.
const salesSummaryResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    from: z.string().min(1),
    to: z.string().min(1),
    totalSales: z.number(),
    ticketCount: z.number().int(),
    averageTicket: z.number(),
    byDay: z.array(salesDaySchema),
    byMethod: z.array(salesMethodSchema)
  })
});

// Display vocabulary for the Spanish UI. Unknown tokens fall back to the raw
// value; entries are never merged or summed with local metodo totals.
const METHOD_LABELS: Readonly<Record<string, string>> = {
  cash: "Efectivo",
  credito: "Tarjeta crédito",
  cuenta_corriente: "Cuenta corriente",
  debito: "Tarjeta débito",
  efectivo: "Efectivo",
  mercadopago: "Mercado Pago",
  qr: "QR",
  tarjeta: "Tarjeta",
  transfer: "Transferencia",
  transferencia: "Transferencia"
};

export function normalizePaymentMethodLabel(method: string): string {
  const key = method.trim().toLowerCase();
  if (Object.hasOwn(METHOD_LABELS, key)) return METHOD_LABELS[key] as string;
  return method;
}

function defaultFetch(url: string, init: { headers: Record<string, string> }) {
  return fetch(url, { headers: init.headers });
}

/**
 * Remote sales-summary reader (DIP: route depends on this module, tests inject
 * fetchImpl so they never touch the network). Bearer travels only in the
 * Authorization header; nothing sensitive is logged or returned.
 */
export class HttpSalesSummaryRepository {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: SalesSummaryHttpFetch;

  public constructor(config: HttpSalesSummaryRepositoryConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.token = config.token;
    this.fetchImpl = config.fetchImpl ?? defaultFetch;
  }

  public async summary(query: SalesSummaryQuery): Promise<Result<SalesSummary, GestionError>> {
    const params = new URLSearchParams({ from: query.desde, to: query.hasta });
    let response: { ok: boolean; status: number; json(): Promise<unknown> };
    try {
      response = await this.fetchImpl(`${this.baseUrl}/api/v1/reports/sales-summary?${params.toString()}`, {
        headers: { Authorization: `Bearer ${this.token}` }
      });
    } catch {
      return err(createGestionError(ERROR_CODES.DEPENDENCY_UNAVAILABLE));
    }

    if (response.status === 401) {
      return err(createGestionError(ERROR_CODES.AUTHENTICATION_REQUIRED));
    }
    // Console contract: missing or unknown Bearer identity answers 404
    // instead of 401 on collection endpoints.
    if (response.status === 404) {
      return err(createGestionError(ERROR_CODES.AUTHENTICATION_REQUIRED));
    }
    if (response.status === 403) {
      return err(createGestionError(ERROR_CODES.FORBIDDEN));
    }
    if (!response.ok) {
      return err(createGestionError(ERROR_CODES.DEPENDENCY_UNAVAILABLE));
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return err(createGestionError(ERROR_CODES.DEPENDENCY_UNAVAILABLE));
    }
    const parsed = salesSummaryResponseSchema.safeParse(body);
    if (!parsed.success) {
      return err(createGestionError(ERROR_CODES.DEPENDENCY_UNAVAILABLE));
    }

    const data = parsed.data.data;
    return ok({
      from: data.from,
      to: data.to,
      totalSales: data.totalSales,
      ticketCount: data.ticketCount,
      averageTicket: data.averageTicket,
      // Zero-filled series passes through untouched (no re-bucketing here).
      byDay: data.byDay.map((day) => ({ date: day.date, total: day.total, count: day.count })),
      byMethod: data.byMethod.map((row) => ({
        method: row.method,
        label: normalizePaymentMethodLabel(row.method),
        total: row.total,
        count: row.count
      }))
    });
  }
}

/**
 * Merge a console summary into a local snapshot. Only the VENTAS netas and
 * cantidad come from the API (totalSales already nets reversals, like the
 * local netas field); devoluciones stays local for display, and compras,
 * gastos and neto stay locally derived (neto recomputed from the API netas
 * minus the local gastos, mirroring buildPeriodSnapshot).
 */
export function withSalesSummary(base: PeriodSnapshot, summary: SalesSummary): PeriodSnapshot {
  const extras: SalesApiExtras = {
    promedio: summary.averageTicket,
    byDay: summary.byDay,
    byMethod: summary.byMethod
  };
  return {
    ...base,
    ventas: { netas: summary.totalSales, cantidad: summary.ticketCount, devoluciones: base.ventas.devoluciones },
    neto: summary.totalSales - base.gastos.total,
    source: "api",
    ventasApi: extras
  };
}

/** Mark a local snapshot as local-sourced without touching any totals. */
export function withLocalSource(base: PeriodSnapshot): PeriodSnapshot {
  return { ...base, source: "local" };
}
