"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";

import { Button } from "./Button";

export interface DataTableColumn<T> {
  readonly key: string;
  readonly header: string;
  readonly accessor?: keyof T;
  readonly render?: (row: T) => ReactNode;
  readonly cell?: (row: T) => ReactNode;
}

export interface DataTableProps<T> {
  readonly columns: readonly DataTableColumn<T>[];
  readonly data?: readonly T[];
  readonly rows?: readonly T[];
  readonly isLoading?: boolean;
  readonly loading?: boolean;
  readonly error?: string | null;
  readonly onRetry?: () => void;
  readonly onRowClick?: (row: T) => void;
  readonly actions?: (row: T) => ReactNode;
  readonly rowActions?: (row: T) => ReactNode;
  readonly getRowId?: (row: T, index: number) => string;
  readonly visibleRowLimit?: number;
  readonly caption?: string;
  readonly emptyMessage?: string;
}

function renderCell<T>(column: DataTableColumn<T>, row: T): ReactNode {
  if (column.render) {
    return column.render(row);
  }
  if (column.cell) {
    return column.cell(row);
  }
  if (column.accessor) {
    return String(row[column.accessor] ?? "");
  }
  return null;
}

export function DataTable<T>({
  actions,
  caption = "Tabla de datos",
  columns,
  data,
  emptyMessage = "No hay datos para mostrar.",
  error,
  getRowId = (_row, index) => String(index),
  isLoading,
  loading,
  onRetry,
  onRowClick,
  rowActions,
  rows,
  visibleRowLimit = 10
}: DataTableProps<T>) {
  const [showAll, setShowAll] = useState(false);
  const tableData = data ?? rows ?? [];
  const loadingState = isLoading ?? loading ?? false;
  const actionsRenderer = actions ?? rowActions;
  const limitedData = showAll ? tableData : tableData.slice(0, visibleRowLimit);
  const hasMore = !showAll && tableData.length > visibleRowLimit;
  const columnCount = columns.length + (actionsRenderer ? 1 : 0);

  const handleRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, row: T) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onRowClick?.(row);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table aria-busy={loadingState || undefined} className="min-w-full border-collapse text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 z-10 bg-surface-muted text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              {columns.map((column) => (
                <th className="whitespace-nowrap px-4 py-3 font-semibold" key={column.key} scope="col">
                  {column.header}
                </th>
              ))}
              {actionsRenderer ? (
                <th className="whitespace-nowrap px-4 py-3 font-semibold" scope="col">
                  Acciones
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {loadingState ? (
              <tr>
                <td className="px-4 py-8" colSpan={columnCount}>
                  <div aria-label="Cargando tabla" className="text-center text-ink-muted" role="status">
                    Cargando…
                  </div>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td className="px-4 py-8" colSpan={columnCount}>
                  <div className="flex flex-col items-center gap-3 text-center" role="alert">
                    <p className="text-danger">{error}</p>
                    {onRetry ? (
                      <Button onClick={onRetry} variant="secondary">
                        Reintentar
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ) : tableData.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-ink-muted" colSpan={columnCount}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              limitedData.map((row, index) => (
                <tr
                  className={onRowClick ? "cursor-pointer outline-none focus-visible:bg-brand/10" : undefined}
                  key={getRowId(row, index)}
                  onClick={() => onRowClick?.(row)}
                  onKeyDown={(event) => handleRowKeyDown(event, row)}
                  tabIndex={onRowClick ? 0 : undefined}
                >
                  {columns.map((column) => (
                    <td className="whitespace-nowrap px-4 py-3 text-ink" key={column.key}>
                      {renderCell(column, row)}
                    </td>
                  ))}
                  {actionsRenderer ? (
                    <td
                      className="whitespace-nowrap px-4 py-3"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {actionsRenderer(row)}
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {hasMore ? (
        <div className="flex justify-center">
          <Button onClick={() => setShowAll(true)} variant="secondary">
            Mostrar más
          </Button>
        </div>
      ) : null}
    </div>
  );
}
