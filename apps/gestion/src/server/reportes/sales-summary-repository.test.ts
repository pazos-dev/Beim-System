import { describe, expect, it } from "vitest";

import { buildPeriodSnapshot } from "../../lib/domain/reports/reports";
import {
  HttpSalesSummaryRepository,
  normalizePaymentMethodLabel,
  withLocalSource,
  withSalesSummary,
  type SalesSummaryHttpFetch
} from "./sales-summary-repository";

const BASE_URL = "http://console-sales-test:4000";
const TOKEN = "console-bearer-sales-1";

function remoteSummaryOk(): unknown {
  return {
    ok: true,
    data: {
      from: "2026-01-01",
      to: "2026-01-31",
      totalSales: 5000,
      ticketCount: 25,
      averageTicket: 200,
      byDay: [
        { date: "2026-01-01", total: 0, count: 0 },
        { date: "2026-01-02", total: 5000, count: 25 }
      ],
      byMethod: [
        { method: "efectivo", total: 3000, count: 15 },
        { method: "tarjeta", total: 2000, count: 10 }
      ]
    }
  };
}

function stubFetch(body: unknown, status = 200): { calls: Array<{ url: string; init: { headers: Record<string, string> } }>; fetchImpl: SalesSummaryHttpFetch } {
  const calls: Array<{ url: string; init: { headers: Record<string, string> } }> = [];
  const fetchImpl: SalesSummaryHttpFetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { calls, fetchImpl };
}

describe("HttpSalesSummaryRepository", () => {
  it("maps desde/hasta to from/to and sends the Bearer token", async () => {
    const { calls, fetchImpl } = stubFetch(remoteSummaryOk());
    const repository = new HttpSalesSummaryRepository({ baseUrl: `${BASE_URL}/`, token: TOKEN, fetchImpl });

    const result = await repository.summary({ desde: "2026-01-01", hasta: "2026-01-31" });

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/api/v1/reports/sales-summary?from=2026-01-01&to=2026-01-31`);
    expect(calls[0]?.init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("passes the zero-filled byDay series through untouched", async () => {
    const { fetchImpl } = stubFetch(remoteSummaryOk());
    const repository = new HttpSalesSummaryRepository({ baseUrl: BASE_URL, token: TOKEN, fetchImpl });

    const result = await repository.summary({ desde: "2026-01-01", hasta: "2026-01-31" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.byDay).toEqual([
      { date: "2026-01-01", total: 0, count: 0 },
      { date: "2026-01-02", total: 5000, count: 25 }
    ]);
    expect(result.value.totalSales).toBe(5000);
    expect(result.value.ticketCount).toBe(25);
    expect(result.value.averageTicket).toBe(200);
  });

  it("keeps the raw method token next to a normalized display label without merging", async () => {
    const body = remoteSummaryOk() as { ok: boolean; data: { byMethod: Array<{ method: string; total: number; count: number }> } };
    body.data.byMethod.push({ method: "EFECTIVO", total: 100, count: 1 });
    body.data.byMethod.push({ method: " livestock ", total: 50, count: 1 });
    const { fetchImpl } = stubFetch(body);
    const repository = new HttpSalesSummaryRepository({ baseUrl: BASE_URL, token: TOKEN, fetchImpl });

    const result = await repository.summary({ desde: "2026-01-01", hasta: "2026-01-31" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.byMethod).toEqual([
      { method: "efectivo", label: "Efectivo", total: 3000, count: 15 },
      { method: "tarjeta", label: "Tarjeta", total: 2000, count: 10 },
      { method: "EFECTIVO", label: "Efectivo", total: 100, count: 1 },
      { method: " livestock ", label: " livestock ", total: 50, count: 1 }
    ]);
  });

  it("fails closed with DEPENDENCY_UNAVAILABLE on envelope shape mismatches", async () => {
    const malformed: unknown[] = [
      { ok: true, data: null },
      { ok: true, data: { ...((remoteSummaryOk() as { data: Record<string, unknown> }).data), ticketCount: "25" } },
      { ok: true, data: { ...((remoteSummaryOk() as { data: Record<string, unknown> }).data), byDay: "not-an-array" } },
      { ok: true },
      { ok: false, error: { code: "SOMETHING" } },
      null,
      "boom"
    ];
    for (const body of malformed) {
      const { fetchImpl } = stubFetch(body);
      const repository = new HttpSalesSummaryRepository({ baseUrl: BASE_URL, token: TOKEN, fetchImpl });
      const result = await repository.summary({ desde: "2026-01-01", hasta: "2026-01-31" });
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error.code).toBe("DEPENDENCY_UNAVAILABLE");
    }
  });

  it("fails closed with DEPENDENCY_UNAVAILABLE when the network throws or returns 500", async () => {
    const throwing: SalesSummaryHttpFetch = async () => {
      throw new Error("network down");
    };
    const down = await new HttpSalesSummaryRepository({ baseUrl: BASE_URL, token: TOKEN, fetchImpl: throwing }).summary({
      desde: "2026-01-01",
      hasta: "2026-01-31"
    });
    expect(down.ok).toBe(false);
    if (!down.ok) expect(down.error.code).toBe("DEPENDENCY_UNAVAILABLE");

    const { fetchImpl } = stubFetch({ ok: false }, 500);
    const failed = await new HttpSalesSummaryRepository({ baseUrl: BASE_URL, token: TOKEN, fetchImpl }).summary({
      desde: "2026-01-01",
      hasta: "2026-01-31"
    });
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.error.code).toBe("DEPENDENCY_UNAVAILABLE");
  });

  it("maps 401/404 to AUTHENTICATION_REQUIRED and 403 to FORBIDDEN", async () => {
    for (const [status, code] of [[401, "AUTHENTICATION_REQUIRED"], [404, "AUTHENTICATION_REQUIRED"], [403, "FORBIDDEN"]] as const) {
      const { fetchImpl } = stubFetch({ ok: false }, status);
      const repository = new HttpSalesSummaryRepository({ baseUrl: BASE_URL, token: TOKEN, fetchImpl });
      const result = await repository.summary({ desde: "2026-01-01", hasta: "2026-01-31" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe(code);
    }
  });
});

describe("normalizePaymentMethodLabel", () => {
  it("normalizes known tokens case-insensitively and keeps unknown raw", () => {
    expect(normalizePaymentMethodLabel("EFECTIVO")).toBe("Efectivo");
    expect(normalizePaymentMethodLabel(" transferencia ")).toBe("Transferencia");
    expect(normalizePaymentMethodLabel("mercadopago")).toBe("Mercado Pago");
    expect(normalizePaymentMethodLabel("other-method")).toBe("other-method");
  });
});

describe("withSalesSummary / withLocalSource", () => {
  const local = buildPeriodSnapshot({
    desde: "2026-01-01",
    hasta: "2026-01-31",
    ventas: [
      { estado: "confirmada", total: 1000 },
      { estado: "devuelta", total: 200 }
    ],
    compras: [{ fecha: "2026-01-10T12:00:00.000Z", total: 400 }],
    gastos: [{ fecha: "2026-01-05T12:00:00.000Z", importe: 100, categoria: "operativo" }]
  });

  it("builds VENTAS from the API while keeping devoluciones, compras, gastos and a locally derived neto", () => {
    const merged = withSalesSummary(local, {
      from: "2026-01-01",
      to: "2026-01-31",
      totalSales: 5000,
      ticketCount: 25,
      averageTicket: 200,
      byDay: [{ date: "2026-01-01", total: 0, count: 0 }],
      byMethod: [{ method: "efectivo", label: "Efectivo", total: 5000, count: 25 }]
    });

    expect(merged.ventas).toEqual({ netas: 5000, cantidad: 25, devoluciones: 200 });
    expect(merged.compras).toEqual(local.compras);
    expect(merged.gastos).toEqual(local.gastos);
    expect(merged.neto).toBe(5000 - local.gastos.total);
    expect(merged.source).toBe("api");
    expect(merged.ventasApi).toEqual({
      promedio: 200,
      byDay: [{ date: "2026-01-01", total: 0, count: 0 }],
      byMethod: [{ method: "efectivo", label: "Efectivo", total: 5000, count: 25 }]
    });
  });

  it("marks the local snapshot without touching any totals", () => {
    expect(withLocalSource(local)).toEqual({ ...local, source: "local" });
  });
});
