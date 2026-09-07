"use client";

import { DataTable, type DataTableColumn } from "../ui/DataTable";
import { Button } from "../ui/Button";

export interface ServicioListRow {
  readonly id: string;
  readonly displayName: string;
  readonly price: number;
  readonly active: boolean;
  readonly version: number;
}

export interface ServiciosTableProps {
  readonly items: readonly ServicioListRow[];
  readonly isLoading?: boolean;
  readonly error?: string | null;
  readonly onRetry?: () => void;
  readonly canManage?: boolean;
  readonly onEdit?: (row: ServicioListRow) => void;
  readonly onDeactivate?: (row: ServicioListRow) => void;
}

const columns: readonly DataTableColumn<ServicioListRow>[] = [
  { accessor: "displayName", header: "Nombre del servicio", key: "displayName" },
  {
    header: "Precio",
    key: "price",
    render: (row) => `$ ${row.price}`
  },
  { header: "Estado", key: "estado", render: (row) => (row.active ? "Activo" : "Inactivo") }
];

export function ServiciosTable({
  canManage = false,
  error,
  isLoading,
  items,
  onDeactivate,
  onEdit,
  onRetry
}: ServiciosTableProps) {
  return (
    <DataTable
      actions={
        canManage
          ? (row) => (
              <div className="flex items-center gap-3">
                <Button onClick={() => onEdit?.(row)} type="button" variant="secondary">
                  Editar
                </Button>
                <Button onClick={() => onDeactivate?.(row)} type="button" variant="danger">
                  Desactivar
                </Button>
              </div>
            )
          : undefined
      }
      caption="Servicios"
      columns={columns}
      data={items}
      emptyMessage="No hay servicios para mostrar."
      error={error}
      getRowId={(row) => row.id}
      isLoading={isLoading}
      onRetry={onRetry}
      visibleRowLimit={items.length}
    />
  );
}
