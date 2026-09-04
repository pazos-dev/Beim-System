"use client";

import { useEffect, useState } from "react";

import { DataTable, type DataTableColumn } from "../ui/DataTable";
import { DashboardMetrics, type DashboardMetric } from "./DashboardMetrics";

interface FocusCard {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly href: string;
}

interface RecentOrder {
  readonly id: string;
  readonly number: string;
  readonly customer: string;
  readonly status: string;
}

interface LowStockItem {
  readonly id: string;
  readonly name: string;
  readonly stock: number;
  readonly minimum: number;
}

interface DashboardData {
  readonly metrics: readonly DashboardMetric[];
  readonly focusCards: readonly FocusCard[];
  readonly recentOrders: readonly RecentOrder[];
  readonly lowStock: readonly LowStockItem[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asDashboardData(payload: unknown): DashboardData {
  if (!isRecord(payload)) {
    throw new Error("La respuesta del dashboard no es válida.");
  }

  const candidate = isRecord(payload.data) ? payload.data : payload;
  if (
    !Array.isArray(candidate.metrics) ||
    !Array.isArray(candidate.focusCards) ||
    !Array.isArray(candidate.recentOrders) ||
    !Array.isArray(candidate.lowStock)
  ) {
    throw new Error("La respuesta del dashboard está incompleta.");
  }

  return {
    focusCards: candidate.focusCards as FocusCard[],
    lowStock: candidate.lowStock as LowStockItem[],
    metrics: candidate.metrics as DashboardMetric[],
    recentOrders: candidate.recentOrders as RecentOrder[]
  };
}

const orderColumns: readonly DataTableColumn<RecentOrder>[] = [
  { accessor: "number", header: "Orden", key: "number" },
  { accessor: "customer", header: "Cliente", key: "customer" },
  { accessor: "status", header: "Estado", key: "status" }
];

const stockColumns: readonly DataTableColumn<LowStockItem>[] = [
  { accessor: "name", header: "Producto", key: "name" },
  { accessor: "stock", header: "Stock", key: "stock" },
  { accessor: "minimum", header: "Mínimo", key: "minimum" }
];

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);

    fetch("/api/gestion/bootstrap", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("No se pudo cargar el dashboard.");
        }
        return asDashboardData(await response.json());
      })
      .then((nextData) => {
        if (active) {
          setData(nextData);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setData(null);
          setError("No se pudo cargar el dashboard. Reintentá cuando la dependencia esté disponible.");
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [retryKey]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">Operación diaria</p>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Dashboard</h1>
        <p className="max-w-2xl text-ink-muted">Un resumen de las excepciones que requieren atención del equipo.</p>
      </header>

      <DashboardMetrics
        error={error}
        isLoading={isLoading}
        metrics={data?.metrics}
        onRetry={() => setRetryKey((current) => current + 1)}
      />

      {isLoading ? (
        <div className="grid gap-8 xl:grid-cols-2">
          <DataTable columns={orderColumns} data={[]} isLoading />
          <DataTable columns={stockColumns} data={[]} isLoading />
        </div>
      ) : error ? null : data ? (
        <>
          <section aria-labelledby="focus-title" className="flex flex-col gap-4">
            <div>
              <h2 className="text-xl font-semibold text-ink" id="focus-title">
                Focos de atención
              </h2>
              <p className="text-sm text-ink-muted">Accesos a vistas filtradas por la consulta autorizada.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {data.focusCards.map((card) => (
                <a
                  className="rounded-xl border border-line bg-surface p-5 transition-colors hover:border-brand hover:bg-brand/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  href={card.href}
                  key={card.id}
                >
                  <h3 className="font-semibold text-ink">{card.title}</h3>
                  <p className="mt-2 text-sm text-ink-muted">{card.description}</p>
                </a>
              ))}
            </div>
          </section>
          <div className="grid gap-8 xl:grid-cols-2">
            <section aria-labelledby="recent-orders-title" className="flex flex-col gap-4">
              <h2 className="text-xl font-semibold text-ink" id="recent-orders-title">
                Órdenes recientes
              </h2>
              <DataTable columns={orderColumns} data={data.recentOrders} getRowId={(row) => row.id} />
            </section>
            <section aria-labelledby="low-stock-title" className="flex flex-col gap-4">
              <h2 className="text-xl font-semibold text-ink" id="low-stock-title">
                Stock bajo
              </h2>
              <DataTable columns={stockColumns} data={data.lowStock} getRowId={(row) => row.id} />
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
