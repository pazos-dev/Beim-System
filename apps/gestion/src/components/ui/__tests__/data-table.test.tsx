// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DataTable, type DataTableColumn } from "../DataTable";

interface Row {
  id: string;
  name: string;
}

const columns: readonly DataTableColumn<Row>[] = [
  { key: "name", header: "Nombre", accessor: "name" }
];

const rows: readonly Row[] = [
  { id: "1", name: "Ana" },
  { id: "2", name: "Beto" }
];

describe("DataTable", () => {
  it("renders a visible loading state", () => {
    render(<DataTable columns={columns} data={[]} isLoading />);

    expect(screen.getByRole("status")).toHaveTextContent("Cargando");
    expect(screen.getByRole("table")).toHaveAttribute("aria-busy", "true");
  });

  it("renders an error and retries without showing rows", () => {
    const onRetry = vi.fn();
    render(<DataTable columns={columns} data={[]} error="No se pudo cargar." onRetry={onRetry} />);

    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar.");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.queryByText("Ana")).not.toBeInTheDocument();
  });

  it("renders an empty state", () => {
    render(<DataTable columns={columns} data={[]} />);

    expect(screen.getByText("No hay datos para mostrar.")).toBeInTheDocument();
  });

  it("renders rows, limits them, and opens a row on click or Enter", () => {
    const onRowClick = vi.fn();
    const manyRows = Array.from({ length: 3 }, (_, index) => ({
      id: String(index + 1),
      name: `Persona ${index + 1}`
    }));

    render(
      <DataTable
        columns={columns}
        data={manyRows}
        onRowClick={onRowClick}
        visibleRowLimit={2}
      />
    );

    expect(screen.getByText("Persona 1")).toBeInTheDocument();
    expect(screen.getByText("Persona 2")).toBeInTheDocument();
    expect(screen.queryByText("Persona 3")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Persona 1"));
    fireEvent.keyDown(screen.getByText("Persona 2").closest("tr")!, { key: "Enter" });
    expect(onRowClick).toHaveBeenNthCalledWith(1, manyRows[0]);
    expect(onRowClick).toHaveBeenNthCalledWith(2, manyRows[1]);

    fireEvent.click(screen.getByRole("button", { name: "Mostrar más" }));
    expect(screen.getByText("Persona 3")).toBeInTheDocument();
  });

  it("renders a row actions slot without invoking the row callback", () => {
    const onRowClick = vi.fn();
    const onAction = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={rows}
        onRowClick={onRowClick}
        actions={(row) => (
          <button type="button" onClick={onAction} aria-label={`Editar ${row.name}`}>
            Editar
          </button>
        )}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Editar Ana" }));
    expect(onAction).toHaveBeenCalledOnce();
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("keeps plain headers when no sort props are provided", () => {
    const sortableColumns: readonly DataTableColumn<Row>[] = [
      { key: "name", header: "Nombre", accessor: "name", sortable: true }
    ];
    render(<DataTable columns={sortableColumns} data={rows} />);
    expect(screen.getByRole("columnheader", { name: "Nombre" })).not.toHaveAttribute("aria-sort");
    expect(screen.queryByRole("button", { name: /Ordenar por/ })).not.toBeInTheDocument();
  });

  it("renders sortable header buttons and reports clicks with the aria-sort state", () => {
    const onSort = vi.fn();
    const sortableColumns: readonly DataTableColumn<Row>[] = [
      { key: "name", header: "Nombre", accessor: "name", sortable: true }
    ];
    const { rerender } = render(
      <DataTable
        columns={sortableColumns}
        data={rows}
        onSort={onSort}
        sortColumn="name"
        sortDirection="asc"
      />
    );

    const header = screen.getByRole("columnheader", { name: /Nombre/ });
    expect(sortableColumns[0]?.sortable).toBe(true);
    expect(header).toHaveAttribute("aria-sort", "ascending");
    fireEvent.click(screen.getByRole("button", { name: "Ordenar por Nombre" }));
    expect(onSort).toHaveBeenCalledWith("name");

    rerender(
      <DataTable
        columns={sortableColumns}
        data={rows}
        onSort={onSort}
        sortColumn="name"
        sortDirection="desc"
      />
    );
    expect(screen.getByRole("columnheader", { name: /Nombre/ })).toHaveAttribute(
      "aria-sort",
      "descending"
    );
  });
});
