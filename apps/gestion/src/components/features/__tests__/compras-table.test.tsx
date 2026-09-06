// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ComprasTable, type CompraListRow } from "../ComprasTable";

const rows: readonly CompraListRow[] = [
  {
    cantidad: 10,
    comprobante: "FAC-001",
    costoUnitario: 120,
    fecha: "2026-09-06T10:00:00.000Z",
    id: "c_1",
    productoId: "p_1",
    proveedor: "Proveedor Uno",
    total: 1200
  },
  {
    cantidad: 5,
    costoUnitario: 80,
    fecha: "2026-09-05T10:00:00.000Z",
    id: "c_2",
    productoId: "p_2",
    proveedor: "Proveedor Dos",
    total: 400
  }
];

describe("ComprasTable", () => {
  it("renders the history columns with row values", () => {
    render(<ComprasTable items={rows} />);
    for (const header of ["Fecha", "Producto", "Proveedor", "Cantidad", "Costo", "Total", "Comprobante"]) {
      expect(screen.getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
    expect(screen.getByText("Proveedor Uno")).toBeInTheDocument();
    expect(screen.getByText("FAC-001")).toBeInTheDocument();
    expect(screen.getByText("1200")).toBeInTheDocument();
  });

  it("shows loading, error with retry, and empty states", () => {
    const { unmount } = render(<ComprasTable items={[]} isLoading />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    unmount();

    const onRetry = vi.fn();
    render(<ComprasTable items={[]} error="No se pudieron cargar las compras." onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar las compras.");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    unmount();

    render(<ComprasTable items={[]} />);
    expect(screen.getByText("No hay compras para mostrar.")).toBeInTheDocument();
  });
});
