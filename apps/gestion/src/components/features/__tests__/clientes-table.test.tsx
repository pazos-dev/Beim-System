// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ClientesTable, type ClienteListRow } from "../ClientesTable";

const rows: readonly ClienteListRow[] = [
  {
    active: true,
    displayName: "María Gómez",
    document: "30123456",
    email: "maria@example.com",
    id: "c_1",
    phone: "1112345678",
    version: 1
  },
  { active: false, displayName: "Juan Pérez", id: "c_2", version: 2 }
];

describe("ClientesTable", () => {
  it("renders the four target columns with row values", () => {
    render(<ClientesTable canManage items={rows} />);
    expect(screen.getByRole("columnheader", { name: "Nombre del cliente" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Documento" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Teléfono" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Estado" })).toBeInTheDocument();
    expect(screen.getByText("María Gómez")).toBeInTheDocument();
    expect(screen.getByText("30123456")).toBeInTheDocument();
    expect(screen.getByText("1112345678")).toBeInTheDocument();
    expect(screen.getByText("Activo")).toBeInTheDocument();
    expect(screen.getByText("Inactivo")).toBeInTheDocument();
  });

  it("gates row actions by role: Ver órdenes only when canManage", () => {
    const { rerender } = render(<ClientesTable canManage={false} items={rows} />);
    expect(screen.queryByRole("link", { name: "Ver órdenes" })).not.toBeInTheDocument();
    rerender(<ClientesTable canManage items={rows} />);
    const links = screen.getAllByRole("link", { name: "Ver órdenes" });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/app/ordenes");
    }
  });

  it("shows loading, error with retry, and empty states", () => {
    const { unmount } = render(<ClientesTable canManage={false} items={[]} isLoading />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    unmount();

    const onRetry = vi.fn();
    render(<ClientesTable canManage={false} items={[]} error="No se pudieron cargar los clientes." onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar los clientes.");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows an empty message when there are no rows", () => {
    render(<ClientesTable canManage={false} items={[]} />);
    expect(screen.getByText("No hay clientes para mostrar.")).toBeInTheDocument();
  });
});
