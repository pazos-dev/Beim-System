"use client";

import { STATE_TOKEN_LABELS, type StateToken } from "../../lib/state-tokens";
import { DataTable, type DataTableColumn } from "../ui/DataTable";

export interface OrderListRow {
  id: string;
  numero: string;
  clienteId: string;
  clienteNombre: string;
  equipment: string;
  estado: StateToken;
  estimatedDisplay: string;
  total: number;
  paymentStatus: "pendiente" | "parcial" | "pagado";
  boletaNumero?: string;
}

export interface OrdersTableProps {
  readonly canViewBoleta: boolean;
  readonly items: readonly OrderListRow[];
  readonly isLoading?: boolean;
  readonly error?: string | null;
  readonly onRetry?: () => void;
  readonly onRowClick?: (row: OrderListRow) => void;
  readonly sortColumn?: string | null;
  readonly sortDirection?: "asc" | "desc";
  readonly onSort?: (columnKey: string) => void;
}

export function OrdersTable({
  canViewBoleta,
  items,
  isLoading,
  error,
  onRetry,
  onRowClick,
  sortColumn,
  sortDirection,
  onSort
}: OrdersTableProps) {
  const columns: DataTableColumn<OrderListRow>[] = [
    { key: "numero", header: "Numero de orden", accessor: "numero", sortable: true },
    { key: "cliente", header: "Nombre del cliente", accessor: "clienteNombre", sortable: true },
    { key: "equipment", header: "Equipo", accessor: "equipment" },
    { key: "estado", header: "Etapa", render: (row) => STATE_TOKEN_LABELS[row.estado], sortable: true },
    { key: "estimated", header: "Tiempo", accessor: "estimatedDisplay" },
    { key: "total", header: "Total", render: (row) => `$${row.total.toLocaleString("es-AR")}`, sortable: true },
    {
      key: "payment",
      header: "Pago",
      render: (row) =>
        row.paymentStatus === "pagado" ? "Pagado" : row.paymentStatus === "parcial" ? "Parcial" : "Pendiente"
    }
  ];
  if (canViewBoleta) {
    columns.push({ key: "boleta", header: "Boleta", accessor: "boletaNumero" });
  }

  return (
    <DataTable
      caption="Órdenes de trabajo"
      columns={columns}
      data={items}
      emptyMessage="No hay órdenes para el filtro seleccionado."
      error={error}
      isLoading={isLoading}
      onRetry={onRetry}
      onRowClick={onRowClick}
      onSort={onSort}
      sortColumn={sortColumn}
      sortDirection={sortDirection}
      visibleRowLimit={items.length}
    />
  );
}