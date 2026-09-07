// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { PeriodSnapshot } from "../../../lib/domain/reports/reports";
import { ReportesPanel } from "../ReportesPanel";

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
