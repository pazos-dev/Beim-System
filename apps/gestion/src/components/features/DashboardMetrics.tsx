"use client";

import { Button } from "../ui/Button";

export interface DashboardMetric {
  readonly id: string;
  readonly label: string;
  readonly value: number | string;
}

export interface DashboardMetricsProps {
  readonly metrics?: readonly DashboardMetric[];
  readonly isLoading?: boolean;
  readonly error?: string | null;
  readonly onRetry?: () => void;
}

const DAILY_METRICS: readonly { id: string; label: string }[] = [
  { id: "orders", label: "Órdenes del día" },
  { id: "pending-payments", label: "Pagos pendientes" },
  { id: "low-stock", label: "Stock bajo" },
  { id: "daily-expenses", label: "Gastos del día" }
];

export function DashboardMetrics({
  error,
  isLoading = false,
  metrics = [],
  onRetry
}: DashboardMetricsProps) {
  if (isLoading) {
    return (
      <section aria-label="Métricas diarias" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" role="status">
        {DAILY_METRICS.map((metric) => (
          <div
            aria-hidden="true"
            className="h-28 animate-pulse rounded-xl border border-line bg-surface-muted"
            data-testid="metric-skeleton"
            key={metric.id}
          />
        ))}
      </section>
    );
  }

  if (error) {
    return (
      <section aria-label="Métricas diarias" className="rounded-xl border border-danger/30 bg-danger/10 p-5" role="alert">
        <p className="text-sm text-danger-strong">{error}</p>
        {onRetry ? (
          <Button className="mt-4" onClick={onRetry} variant="secondary">
            Reintentar
          </Button>
        ) : null}
      </section>
    );
  }

  return (
    <section aria-label="Métricas diarias" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {DAILY_METRICS.map((definition) => {
        const metric = metrics.find((candidate) => candidate.id === definition.id);
        return (
          <article className="rounded-xl border border-line bg-surface p-5 shadow-sm" key={definition.id}>
            <h2 className="text-sm font-medium text-ink-muted">{metric?.label ?? definition.label}</h2>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-ink">{metric?.value ?? "—"}</p>
          </article>
        );
      })}
    </section>
  );
}
