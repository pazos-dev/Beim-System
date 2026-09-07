"use client";

import { Button } from "../ui/Button";
import { DataTable, type DataTableColumn } from "../ui/DataTable";
import type { CategoryTotal, PeriodSnapshot } from "../../lib/domain/reports/reports";

export interface ReportesPanelProps {
  readonly snapshot: PeriodSnapshot | null;
  readonly isLoading?: boolean;
  readonly error?: string | null;
  readonly onRetry?: () => void;
  readonly exportHref: string | null;
  readonly onExported?: () => void;
}

const categoryColumns: readonly DataTableColumn<CategoryTotal>[] = [
  { accessor: "categoria", header: "Categoría", key: "categoria" },
  { accessor: "total", header: "Total", key: "total" }
];

function SummaryCard({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold text-ink">{value}</dd>
    </div>
  );
}

export function ReportesPanel({
  error,
  exportHref,
  isLoading,
  onExported,
  onRetry,
  snapshot
}: ReportesPanelProps) {
  if (isLoading) {
    return <p role="status">Cargando reporte…</p>;
  }
  if (error) {
    return (
      <div className="flex flex-col items-start gap-3" role="alert">
        <p className="text-danger">{error}</p>
        {onRetry ? (
          <Button onClick={onRetry} type="button" variant="secondary">
            Reintentar
          </Button>
        ) : null}
      </div>
    );
  }
  if (!snapshot) {
    return <p>No hay datos para el período seleccionado.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Ventas netas" value={snapshot.ventas.netas} />
        <SummaryCard label="Compras" value={snapshot.compras.total} />
        <SummaryCard label="Gastos" value={snapshot.gastos.total} />
        <SummaryCard label="Neto" value={snapshot.neto} />
        <SummaryCard label="Cantidad de ventas" value={snapshot.ventas.cantidad} />
        <SummaryCard label="Devoluciones" value={snapshot.ventas.devoluciones} />
        <SummaryCard label="Cantidad de compras" value={snapshot.compras.cantidad} />
      </dl>
      <DataTable
        caption="Gastos por categoría"
        columns={categoryColumns}
        data={snapshot.gastos.porCategoria}
        emptyMessage="No hay gastos por categoría para el período."
        getRowId={(row) => row.categoria}
        visibleRowLimit={snapshot.gastos.porCategoria.length}
      />
      {exportHref ? (
        <div>
          <a
            className="inline-flex min-h-10 items-center justify-center rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-strong"
            download
            href={exportHref}
            onClick={() => onExported?.()}
          >
            Exportar CSV
          </a>
        </div>
      ) : null}
    </div>
  );
}
