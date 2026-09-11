// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "./auth-store";
import {
  getCashSummary,
  getRepairsByStatus,
  getSalesSummary,
  getStockValuation,
  getTopProducts,
} from "./reporte-repository";

const fetchMock = vi.fn();

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status,
  });
}

describe("reporte-repository", () => {
  beforeEach(() => {
    useAuthStore.setState({
      actor: { id: "u-1", name: "Test", role: "administrador", username: "test" },
      token: "tok-123",
    });
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    useAuthStore.setState({ actor: null, token: null });
    vi.unstubAllGlobals();
  });

  it("fetches sales summary from GET /api/v1/reports/sales-summary", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        ok: true,
        data: {
          totalSales: 10000,
          ticketCount: 5,
          averageTicket: 2000,
          dailySeries: [{ date: "2026-09-01", sales: 10000, count: 5 }],
        },
      }),
    );

    const result = await getSalesSummary({ from: "2026-09-01", to: "2026-09-30" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "http://localhost:4000/api/v1/reports/sales-summary?from=2026-09-01&to=2026-09-30",
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer tok-123");
    expect(result.totalSales).toBe(10000);
    expect(result.ticketCount).toBe(5);
    expect(result.averageTicket).toBe(2000);
    expect(result.dailySeries).toHaveLength(1);
  });

  it("fetches cash summary from GET /api/v1/reports/cash-summary", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        ok: true,
        data: {
          netByType: { ingreso: 5000, egreso: 2000, ajuste: 100 },
          sessions: [{ date: "2026-09-01", difference: 100 }],
        },
      }),
    );

    const result = await getCashSummary({ from: "2026-09-01", to: "2026-09-30" });

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "http://localhost:4000/api/v1/reports/cash-summary?from=2026-09-01&to=2026-09-30",
    );
    expect(result.netByType).toEqual({ ingreso: 5000, egreso: 2000, ajuste: 100 });
    expect(result.sessions).toHaveLength(1);
  });

  it("fetches stock valuation from GET /api/v1/reports/stock-valuation", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        ok: true,
        data: {
          items: [
            {
              productId: "p_1",
              name: "Producto 1",
              stock: 10,
              price: 100,
              valuation: 1000,
              lowStock: false,
            },
          ],
          total: 1000,
        },
      }),
    );

    const result = await getStockValuation();

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "http://localhost:4000/api/v1/reports/stock-valuation",
    );
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1000);
  });

  it("fetches top products from GET /api/v1/reports/top-products", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        ok: true,
        data: {
          byQuantity: [
            { productId: "p_1", name: "Producto 1", quantity: 10, revenue: 1000 },
          ],
          byRevenue: [
            { productId: "p_2", name: "Producto 2", quantity: 5, revenue: 2000 },
          ],
        },
      }),
    );

    const result = await getTopProducts({ from: "2026-09-01", to: "2026-09-30", limit: 5 });

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "http://localhost:4000/api/v1/reports/top-products?from=2026-09-01&to=2026-09-30&limit=5",
    );
    expect(result.byQuantity).toHaveLength(1);
    expect(result.byRevenue).toHaveLength(1);
  });

  it("fetches repairs by status from GET /api/v1/reports/repairs-by-status", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        ok: true,
        data: {
          counts: {
            Ingresado: 1,
            EnReparacion: 2,
            Listo: 3,
            Entregado: 4,
            Cancelado: 5,
          },
        },
      }),
    );

    const result = await getRepairsByStatus();

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "http://localhost:4000/api/v1/reports/repairs-by-status",
    );
    expect(result.counts.Listo).toBe(3);
  });

  it("omits undefined query params", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        ok: true,
        data: { byQuantity: [], byRevenue: [] },
      }),
    );

    await getTopProducts({ from: "2026-09-01", to: "2026-09-30" });

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "http://localhost:4000/api/v1/reports/top-products?from=2026-09-01&to=2026-09-30",
    );
  });

  it("throws when the backend returns an error envelope", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { ok: false, error: { code: "FORBIDDEN", message: "Acceso denegado" } },
        403,
      ),
    );

    await expect(
      getSalesSummary({ from: "2026-09-01", to: "2026-09-30" }),
    ).rejects.toThrow("Acceso denegado");
  });

  it("throws a dependency error when fetch throws", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    await expect(getStockValuation()).rejects.toThrow("No se pudo conectar con el servidor");
  });
});
