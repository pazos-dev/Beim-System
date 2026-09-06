"use client";

import { DataTable, type DataTableColumn } from "../ui/DataTable";

export interface StockLevelRow {
  readonly productoId: string;
  readonly displayName: string;
  readonly deposito: string;
  readonly balance: number;
  readonly minimum: number;
  readonly lowStock: boolean;
}

export interface StockLevelsTableProps {
  readonly items: readonly StockLevelRow[];
  readonly isLoading?: boolean;
  readonly error?: string | null;
  readonly onRetry?: () => void;
}

const columns: readonly DataTableColumn<StockLevelRow>[] = [
  { accessor: "displayName", header: "Producto", key: "displayName" },
  { accessor: "deposito", header: "Depósito", key: "deposito" },
  { accessor: "balance", header: "Balance", key: "balance" },
  { accessor: "minimum", header: "Mínimo", key: "minimum" },
  { header: "Estado", key: "estado", render: (row) => (row.lowStock ? "Bajo stock" : "OK") }
];

export function StockLevelsTable({ error, isLoading, items, onRetry }: StockLevelsTableProps) {
  return (
    <DataTable
      caption="Niveles de stock"
      columns={columns}
      data={items}
      emptyMessage="No hay stock para mostrar."
      error={error}
      getRowId={(row) => `${row.productoId}::${row.deposito}`}
      isLoading={isLoading}
      onRetry={onRetry}
      visibleRowLimit={items.length}
    />
  );
}
