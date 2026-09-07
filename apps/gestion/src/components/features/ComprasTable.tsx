"use client";

import { DataTable, type DataTableColumn } from "../ui/DataTable";

export interface CompraListRow {
  readonly id: string;
  readonly productoId: string;
  readonly proveedor: string;
  readonly cantidad: number;
  readonly costoUnitario: number;
  readonly total: number;
  readonly fecha: string;
  readonly comprobante?: string;
}

export interface ComprasTableProps {
  readonly items: readonly CompraListRow[];
  readonly isLoading?: boolean;
  readonly error?: string | null;
  readonly onRetry?: () => void;
}

const columns: readonly DataTableColumn<CompraListRow>[] = [
  { accessor: "fecha", header: "Fecha", key: "fecha" },
  { accessor: "productoId", header: "Producto", key: "productoId" },
  { accessor: "proveedor", header: "Proveedor", key: "proveedor" },
  { accessor: "cantidad", header: "Cantidad", key: "cantidad" },
  { accessor: "costoUnitario", header: "Costo", key: "costoUnitario" },
  { accessor: "total", header: "Total", key: "total" },
  {
    header: "Comprobante",
    key: "comprobante",
    render: (row) => row.comprobante ?? "—"
  }
];

export function ComprasTable({ error, isLoading, items, onRetry }: ComprasTableProps) {
  return (
    <DataTable
      caption="Compras"
      columns={columns}
      data={items}
      emptyMessage="No hay compras para mostrar."
      error={error}
      getRowId={(row) => row.id}
      isLoading={isLoading}
      onRetry={onRetry}
      visibleRowLimit={items.length}
    />
  );
}
