"use client";

import Link from "next/link";

import { DataTable, type DataTableColumn } from "../ui/DataTable";

export interface ClienteListRow {
  readonly id: string;
  readonly displayName: string;
  readonly document?: string;
  readonly phone?: string;
  readonly email?: string;
  readonly active: boolean;
  readonly version: number;
}

export interface ClientesTableProps {
  readonly items: readonly ClienteListRow[];
  readonly isLoading?: boolean;
  readonly error?: string | null;
  readonly onRetry?: () => void;
  readonly canManage?: boolean;
}

const columns: readonly DataTableColumn<ClienteListRow>[] = [
  { accessor: "displayName", header: "Nombre del cliente", key: "displayName" },
  { accessor: "document", header: "Documento", key: "document" },
  { accessor: "phone", header: "Teléfono", key: "phone" },
  { header: "Estado", key: "estado", render: (row) => (row.active ? "Activo" : "Inactivo") }
];

export function ClientesTable({ canManage = false, error, isLoading, items, onRetry }: ClientesTableProps) {
  return (
    <DataTable
      actions={
        canManage
          ? () => (
              <Link className="font-semibold text-brand underline underline-offset-2" href="/app/ordenes">
                Ver órdenes
              </Link>
            )
          : undefined
      }
      caption="Clientes"
      columns={columns}
      data={items}
      emptyMessage="No hay clientes para mostrar."
      error={error}
      getRowId={(row) => row.id}
      isLoading={isLoading}
      onRetry={onRetry}
      visibleRowLimit={items.length}
    />
  );
}
