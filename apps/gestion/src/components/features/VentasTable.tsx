"use client";

import { DataTable, type DataTableColumn } from "../ui/DataTable";
import { Button } from "../ui/Button";

export interface VentaListRow {
  readonly id: string;
  readonly numero: string;
  // Server-stamped creation instant (VTA-1); absent for legacy sales.
  readonly fecha?: string;
  readonly total: number;
  readonly estado: "confirmada" | "anulada";
  readonly version: number;
}

export interface VentasTableProps {
  readonly items: readonly VentaListRow[];
  readonly isLoading?: boolean;
  readonly error?: string | null;
  readonly onRetry?: () => void;
  readonly canAnular: boolean;
  readonly onAnular: (row: VentaListRow) => void;
}

function formatFecha(fecha: string | undefined): string {
  if (fecha === undefined) return "—";
  const parsed = Date.parse(fecha);
  if (Number.isNaN(parsed)) return "—";
  return fecha.slice(0, 10);
}

const columns: readonly DataTableColumn<VentaListRow>[] = [
  { accessor: "numero", header: "Número", key: "numero" },
  { header: "Fecha", key: "fecha", render: (row) => formatFecha(row.fecha) },
  { accessor: "total", header: "Total", key: "total" },
  {
    header: "Estado",
    key: "estado",
    render: (row) => (row.estado === "confirmada" ? "Confirmada" : "Anulada")
  }
];

export function VentasTable({ canAnular, error, isLoading, items, onAnular, onRetry }: VentasTableProps) {
  return (
    <DataTable
      actions={
        canAnular
          ? (row) =>
              row.estado === "confirmada" ? (
                <Button onClick={() => onAnular(row)} type="button" variant="secondary">
                  Anular
                </Button>
              ) : null
          : undefined
      }
      caption="Ventas"
      columns={columns}
      data={items}
      emptyMessage="No hay ventas para mostrar."
      error={error}
      getRowId={(row) => row.id}
      isLoading={isLoading}
      onRetry={onRetry}
      visibleRowLimit={items.length}
    />
  );
}
