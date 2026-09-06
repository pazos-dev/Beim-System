// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VentasTable, type VentaListRow } from "../VentasTable";

const rows: readonly VentaListRow[] = [
  { estado: "confirmada", id: "v_1", numero: "V-0001", total: 2500, version: 1 },
  { estado: "anulada", id: "v_2", numero: "V-0002", total: 1200, version: 2 }
];

describe("VentasTable", () => {
  it("renders the numero/total/estado columns with row values", () => {
    render(<VentasTable canAnular={false} items={rows} onAnular={() => {}} />);
    expect(screen.getByRole("columnheader", { name: "Número" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Total" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Estado" })).toBeInTheDocument();
    expect(screen.getByText("V-0001")).toBeInTheDocument();
    expect(screen.getByText("2500")).toBeInTheDocument();
    expect(screen.getByText("Confirmada")).toBeInTheDocument();
    expect(screen.getByText("V-0002")).toBeInTheDocument();
    expect(screen.getByText("Anulada")).toBeInTheDocument();
  });

  it("gates the anular action by role and estado", () => {
    const onAnular = vi.fn();
    const { rerender } = render(<VentasTable canAnular={false} items={rows} onAnular={onAnular} />);
    expect(screen.queryByRole("button", { name: "Anular" })).not.toBeInTheDocument();

    rerender(<VentasTable canAnular items={rows} onAnular={onAnular} />);
    const buttons = screen.getAllByRole("button", { name: "Anular" });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    expect(onAnular).toHaveBeenCalledTimes(1);
    expect(onAnular).toHaveBeenCalledWith(rows[0]);
  });

  it("shows loading, error with retry, and empty states", () => {
    const { unmount } = render(<VentasTable canAnular={false} items={[]} isLoading onAnular={() => {}} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    unmount();

    const onRetry = vi.fn();
    render(
      <VentasTable canAnular={false} items={[]} error="No se pudieron cargar las ventas." onRetry={onRetry} onAnular={() => {}} />
    );
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar las ventas.");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows an empty message when there are no rows", () => {
    render(<VentasTable canAnular={false} items={[]} onAnular={() => {}} />);
    expect(screen.getByText("No hay ventas para mostrar.")).toBeInTheDocument();
  });
});
