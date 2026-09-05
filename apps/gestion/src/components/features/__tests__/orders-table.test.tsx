// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OrdersTable, type OrderListRow } from "../OrdersTable";

const rows: readonly OrderListRow[] = [
  {
    clienteId: "c_1",
    clienteNombre: "Martín Ferreyra",
    equipment: "Samsung A54",
    estado: "en_diagnostico",
    estimatedDisplay: "90 min",
    id: "o_1",
    numero: "0001-000001",
    paymentStatus: "pendiente",
    total: 50000
  },
  {
    boletaNumero: "B-0001",
    clienteId: "c_2",
    clienteNombre: "Lucía Benítez",
    equipment: "—",
    estado: "entregado",
    estimatedDisplay: "—",
    id: "o_2",
    numero: "0001-000002",
    paymentStatus: "pagado",
    total: 120000
  }
];

describe("OrdersTable", () => {
  it("renders the eight target columns and hides the boleta column without permission", () => {
    render(<OrdersTable canViewBoleta={false} items={rows} />);
    expect(screen.getByRole("columnheader", { name: "Numero de orden" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Nombre del cliente" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Equipo" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Etapa" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Tiempo" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Total" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Pago" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Boleta" })).not.toBeInTheDocument();
    expect(screen.queryByText("B-0001")).not.toBeInTheDocument();
  });

  it("renders the boleta column only with the principal flag", () => {
    render(<OrdersTable canViewBoleta items={rows} />);
    expect(screen.getByRole("columnheader", { name: "Boleta" })).toBeInTheDocument();
    expect(screen.getByText("B-0001")).toBeInTheDocument();
  });

  it("shows formatted state labels and estimated display", () => {
    render(<OrdersTable canViewBoleta={false} items={rows} />);
    expect(screen.getByText("En diagnóstico")).toBeInTheDocument();
    expect(screen.getByText("90 min")).toBeInTheDocument();
    expect(screen.getByText("Entregado")).toBeInTheDocument();
  });

  it("shows an empty message when there are no rows", () => {
    render(<OrdersTable canViewBoleta={false} items={[]} />);
    expect(screen.getByText("No hay órdenes para el filtro seleccionado.")).toBeInTheDocument();
  });

  it("reports sortable header clicks", () => {
    const onSort = vi.fn();
    render(
      <OrdersTable
        canViewBoleta={false}
        items={rows}
        onSort={onSort}
        sortColumn="numero"
        sortDirection="asc"
      />
    );
    expect(screen.getByRole("columnheader", { name: /Numero de orden/ })).toHaveAttribute(
      "aria-sort",
      "ascending"
    );
    screen.getByRole("button", { name: "Ordenar por Total" }).click();
    expect(onSort).toHaveBeenCalledWith("total");
  });
});