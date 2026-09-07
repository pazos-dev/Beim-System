// @vitest-environment jsdom
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PeriodSnapshot } from "../../../lib/domain/reports/reports";
import { useUiStore } from "../../../lib/ui-store";
import { ToastProvider } from "../../ui/Toast";
import { ReportesPanel } from "../ReportesPanel";

const navigationState = vi.hoisted(() => ({ replace: vi.fn(), search: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigationState.replace }),
  useSearchParams: () => new URLSearchParams(navigationState.search)
}));

// Imported lazily so the RED run proves the page does not exist yet.
async function loadPage(): Promise<() => ReactElement> {
  const module = await import("../../../../app/app/reportes/page");
  return module.default;
}

const SNAPSHOT: PeriodSnapshot = {
  compras: { cantidad: 1, total: 400 },
  desde: "2026-01-01",
  gastos: { porCategoria: [{ categoria: "insumos", total: 300 }], total: 300 },
  hasta: "2026-01-31",
  neto: 500,
  ventas: { cantidad: 2, devoluciones: 200, netas: 800 }
};

const EXPORT_HREF = "/api/gestion/reportes?desde=2026-01-01&hasta=2026-01-31&formato=csv";

function renderPanel(props: Partial<Parameters<typeof ReportesPanel>[0]> = {}): void {
  render(
    <ReportesPanel
      error={null}
      exportHref={EXPORT_HREF}
      isLoading={false}
      onExported={vi.fn()}
      onRetry={vi.fn()}
      snapshot={SNAPSHOT}
      {...props}
    />
  );
}

describe("ReportesPanel", () => {
  it("renders snapshot cards, the category table, and the csv export link", () => {
    const onExported = vi.fn();
    renderPanel({ onExported });
    expect(screen.getByText("Ventas netas")).toBeInTheDocument();
    expect(screen.getByText("800")).toBeInTheDocument();
    expect(screen.getByText("Neto")).toBeInTheDocument();
    expect(screen.getByText("500")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Categoría" })).toBeInTheDocument();
    expect(screen.getByText("insumos")).toBeInTheDocument();
    const exportLink = screen.getByRole("link", { name: "Exportar CSV" });
    expect(exportLink).toHaveAttribute("href", EXPORT_HREF);
  });

  it("notifies on export click without fetching the csv itself", async () => {
    const user = userEvent.setup();
    const onExported = vi.fn();
    renderPanel({ onExported });
    await user.click(screen.getByRole("link", { name: "Exportar CSV" }));
    expect(onExported).toHaveBeenCalledTimes(1);
  });

  it("shows a loading state while the snapshot loads", () => {
    renderPanel({ snapshot: null, isLoading: true, exportHref: null });
    expect(screen.getByRole("status")).toHaveTextContent("Cargando reporte…");
  });

  it("shows an empty state when the period has no snapshot", () => {
    renderPanel({ snapshot: null, exportHref: null });
    expect(screen.getByText("No hay datos para el período seleccionado.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Exportar CSV" })).not.toBeInTheDocument();
  });

  it("shows the error with a retry action", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderPanel({ snapshot: null, error: "No se pudo cargar el reporte.", exportHref: null, onRetry });
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar el reporte.");
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders the table headers when no expense categories exist", () => {
    renderPanel({ snapshot: { ...SNAPSHOT, gastos: { porCategoria: [], total: 0 } } });
    expect(screen.getByRole("columnheader", { name: "Categoría" })).toBeInTheDocument();
    expect(screen.getByText("No hay gastos por categoría para el período.")).toBeInTheDocument();
  });
});

const fetchMock = vi.fn();

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status
  });
}

function stubRoutes(options: { role?: string; snapshot?: () => Promise<Response>; status?: number } = {}): void {
  fetchMock.mockImplementation(async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.startsWith("/api/gestion/reportes")) {
      if (options.snapshot) return options.snapshot();
      return jsonResponse({ data: SNAPSHOT, ok: true }, options.status ?? 200);
    }
    if (url.startsWith("/api/gestion/auth/session")) {
      return jsonResponse(
        { data: { displayName: "Caja", role: options.role ?? "caja", username: "caja" }, ok: true },
        200
      );
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

async function renderPage(): Promise<void> {
  const Page = await loadPage();
  const { createTestQueryClient } = await import("../../../test/query-client");
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ToastProvider>
        <Page />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("ReportesPage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    navigationState.replace.mockReset();
    navigationState.search = "desde=2026-01-01&hasta=2026-01-31";
    vi.stubGlobal("fetch", fetchMock);
    useUiStore.setState({
      reporteExportState: "idle",
      reportePeriodDraft: { desde: "", hasta: "" }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useUiStore.setState({
      reporteExportState: "idle",
      reportePeriodDraft: { desde: "", hasta: "" }
    });
  });

  it("loads the snapshot for the url period and renders cards plus export", async () => {
    stubRoutes();
    await renderPage();
    expect(await screen.findByText("800")).toBeInTheDocument();
    expect(screen.getByText("500")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/gestion/reportes?desde=2026-01-01&hasta=2026-01-31&formato=json",
      expect.objectContaining({ cache: "no-store" })
    );
    const exportLink = screen.getByRole("link", { name: "Exportar CSV" });
    expect(exportLink).toHaveAttribute("href", expect.stringContaining("formato=csv"));
    expect(exportLink).toHaveAttribute("download");
  });

  it("debounces the period draft into the url", async () => {
    const user = userEvent.setup();
    stubRoutes();
    await renderPage();
    expect(await screen.findByText("800")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Hasta"));
    await user.type(screen.getByLabelText("Hasta"), "2026-02-28");
    await waitFor(() =>
      expect(navigationState.replace).toHaveBeenCalledWith("/app/reportes?desde=2026-01-01&hasta=2026-02-28")
    );
  });

  it("exports the csv with a toast", async () => {
    const user = userEvent.setup();
    stubRoutes();
    await renderPage();
    expect(await screen.findByText("800")).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Exportar CSV" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Reporte exportado correctamente.");
  });

  it("shows access denied with a login link on 403", async () => {
    stubRoutes({ status: 403 });
    await renderPage();
    expect(await screen.findByRole("link", { name: "Ir a iniciar sesión" })).toHaveAttribute("href", "/login");
  });

  it("hides the export for roles without report access", async () => {
    stubRoutes({ role: "tecnico", status: 403 });
    await renderPage();
    expect(await screen.findByRole("link", { name: "Ir a iniciar sesión" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Exportar CSV" })).not.toBeInTheDocument();
  });
});
