// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StockLevelsTable, type StockLevelRow } from "../StockLevelsTable";

const rows: readonly StockLevelRow[] = [
  {
    balance: 3,
    deposito: "taller",
    displayName: "Filtro de aceite",
    lowStock: true,
    minimum: 5,
    productoId: "p_1"
  },
  {
    balance: 20,
    deposito: "principal",
    displayName: "Bujía",
    lowStock: false,
    minimum: 5,
    productoId: "p_2"
  }
];

describe("StockLevelsTable", () => {
  it("renders product, deposito, balance, and low-stock columns with values", () => {
    render(<StockLevelsTable items={rows} />);
    expect(screen.getByRole("columnheader", { name: "Producto" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Depósito" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Balance" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Estado" })).toBeInTheDocument();
    expect(screen.getByText("Filtro de aceite")).toBeInTheDocument();
    expect(screen.getByText("taller")).toBeInTheDocument();
    expect(screen.getByText("Bajo stock")).toBeInTheDocument();
    expect(screen.getByText("OK")).toBeInTheDocument();
  });

  it("renders the server-computed low-stock flag without deriving it in the UI", () => {
    render(
      <StockLevelsTable
        items={[
          {
            balance: 10,
            deposito: "principal",
            displayName: "Cadena",
            lowStock: true,
            minimum: 50,
            productoId: "p_9"
          }
        ]}
      />
    );
    expect(screen.getByText("Bajo stock")).toBeInTheDocument();
    expect(screen.queryByText("OK")).not.toBeInTheDocument();
  });

  it("shows loading, error with retry, and empty states", () => {
    const { unmount } = render(<StockLevelsTable items={[]} isLoading />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    unmount();

    const onRetry = vi.fn();
    render(<StockLevelsTable items={[]} error="No se pudo cargar el stock." onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar el stock.");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows an empty message when there are no levels", () => {
    render(<StockLevelsTable items={[]} />);
    expect(screen.getByText("No hay stock para mostrar.")).toBeInTheDocument();
  });
});
