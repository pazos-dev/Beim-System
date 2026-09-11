// @vitest-environment jsdom
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestQueryClient } from "../../../src/test/query-client";
import { useUiStore } from "../../../src/lib/ui-store";
import { ToastProvider } from "../../../src/components/ui/Toast";
import { useActor } from "../../../src/lib/api/auth-store";
import ReportesPage from "./page";

const navigationState = vi.hoisted(() => ({ replace: vi.fn(), search: "" }));
const searchParamsCache = vi.hoisted(() => ({
  current: new URLSearchParams(""),
  lastSearch: "",
}));
const mockActor = vi.hoisted(() =>
  vi.fn<() => { id: string; name: string; role: string; username: string } | null>(() => ({
    id: "u_1",
    name: "Admin",
    role: "administrador",
    username: "admin",
  })),
);

const mockGetSalesSummary = vi.hoisted(() => vi.fn());
const mockGetCashSummary = vi.hoisted(() => vi.fn());
const mockGetStockValuation = vi.hoisted(() => vi.fn());
const mockGetTopProducts = vi.hoisted(() => vi.fn());
const mockGetRepairsByStatus = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigationState.replace }),
  useSearchParams: () => {
    if (navigationState.search !== searchParamsCache.lastSearch) {
      searchParamsCache.current = new URLSearchParams(navigationState.search);
      searchParamsCache.lastSearch = navigationState.search;
    }
    return searchParamsCache.current;
  },
}));

vi.mock("../../../src/lib/api/auth-store", () => ({
  useActor: () => mockActor(),
  useAuthStore: Object.assign(
    () => ({}),
    {
      getState: () => ({ token: "test-token" }),
      setState: vi.fn(),
      subscribe: vi.fn(),
      destroy: vi.fn(),
    },
  ),
}));

vi.mock("../../../src/lib/api/reporte-repository", () => ({
  getSalesSummary: mockGetSalesSummary,
  getCashSummary: mockGetCashSummary,
  getStockValuation: mockGetStockValuation,
  getTopProducts: mockGetTopProducts,
  getRepairsByStatus: mockGetRepairsByStatus,
}));

function renderPage(): void {
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ToastProvider>
        <ReportesPage />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const SALES_SUMMARY = {
  totalSales: 10000,
  ticketCount: 5,
  averageTicket: 2000,
  dailySeries: [{ date: "2026-09-01", sales: 10000, count: 5 }],
};

const CASH_SUMMARY = {
  netByType: { ingreso: 5000, egreso: 2000, ajuste: 100 },
  sessions: [{ date: "2026-09-01", difference: 100 }],
};

const STOCK_VALUATION = {
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
};

const TOP_PRODUCTS = {
  byQuantity: [{ productId: "p_1", name: "Producto 1", quantity: 10, revenue: 1000 }],
  byRevenue: [{ productId: "p_1", name: "Producto 1", quantity: 10, revenue: 1000 }],
};

const REPAIRS_BY_STATUS = {
  counts: { Ingresado: 1, EnReparacion: 2, Listo: 3, Entregado: 4, Cancelado: 5 },
};

function stubRepositories(): void {
  mockGetSalesSummary.mockResolvedValue(SALES_SUMMARY);
  mockGetCashSummary.mockResolvedValue(CASH_SUMMARY);
  mockGetStockValuation.mockResolvedValue(STOCK_VALUATION);
  mockGetTopProducts.mockResolvedValue(TOP_PRODUCTS);
  mockGetRepairsByStatus.mockResolvedValue(REPAIRS_BY_STATUS);
}

describe("ReportesPage", () => {
  beforeEach(() => {
    mockGetSalesSummary.mockReset();
    mockGetCashSummary.mockReset();
    mockGetStockValuation.mockReset();
    mockGetTopProducts.mockReset();
    mockGetRepairsByStatus.mockReset();
    navigationState.replace.mockReset();
    navigationState.search = "";
    searchParamsCache.current = new URLSearchParams("");
    searchParamsCache.lastSearch = "";
    useUiStore.setState({ period: { type: "month", value: "2026-09" } });
    stubRepositories();
  });

  afterEach(() => {
    mockActor.mockReturnValue({
      id: "u_1",
      name: "Admin",
      role: "administrador",
      username: "admin",
    });
    useUiStore.setState({ period: { type: "day", value: "" } });
  });

  it("loads reports from the repository and renders sales summary", async () => {
    renderPage();

    expect(await screen.findByText("Ventas totales")).toBeInTheDocument();
    expect(screen.getByText("Cantidad de tickets")).toBeInTheDocument();
    expect(mockGetSalesSummary).toHaveBeenCalledWith({ from: "2026-09-01", to: "2026-09-30" });
    expect(mockGetCashSummary).toHaveBeenCalledWith({ from: "2026-09-01", to: "2026-09-30" });
    expect(mockGetTopProducts).toHaveBeenCalledWith({
      from: "2026-09-01",
      to: "2026-09-30",
      limit: 5,
    });
    expect(mockGetStockValuation).toHaveBeenCalled();
    expect(mockGetRepairsByStatus).toHaveBeenCalled();
  });

  it("debounces date edits into the URL", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("Ventas totales")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Desde"));
    await user.type(screen.getByLabelText("Desde"), "2026-08-01");

    await waitFor(() =>
      expect(navigationState.replace).toHaveBeenCalledWith(
        expect.stringContaining("desde=2026-08-01"),
      ),
    );
  });

  it("shows access denied when there is no actor", async () => {
    mockActor.mockReturnValue(null);
    renderPage();

    expect(await screen.findByRole("link", { name: "Ir a iniciar sesión" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("shows error state when a report fails to load", async () => {
    mockGetSalesSummary.mockRejectedValue(new Error("fallo"));
    renderPage();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("retries all reports when the retry button is clicked", async () => {
    const user = userEvent.setup();
    mockGetSalesSummary.mockRejectedValue(new Error("fallo"));
    renderPage();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    mockGetSalesSummary.mockReset();
    mockGetSalesSummary.mockResolvedValue(SALES_SUMMARY);

    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("Ventas totales")).toBeInTheDocument();
    expect(mockGetSalesSummary).toHaveBeenCalledTimes(1);
  });
});
