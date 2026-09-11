"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { Button } from "../../../src/components/ui/Button";
import { Input } from "../../../src/components/ui/Input";
import { useActor } from "../../../src/lib/api/auth-store";
import {
  getCashSummary,
  getRepairsByStatus,
  getSalesSummary,
  getStockValuation,
  getTopProducts,
  type ReportFilters,
} from "../../../src/lib/api/reporte-repository";
import { periodToRange } from "../../../src/lib/period-range";
import { useUiStore } from "../../../src/lib/ui-store";

const COPY = {
  ajuste: "Ajustes",
  averageTicket: "Ticket promedio",
  cancelado: "Cancelado",
  cashTitle: "Caja",
  dailySeries: "Ventas por día",
  denied: "Tu sesión no es válida. Iniciá sesión para ver los reportes.",
  egreso: "Egresos",
  empty: "No hay datos para el período seleccionado.",
  enReparacion: "En reparación",
  entregado: "Entregado",
  error: "No se pudieron cargar los reportes. Reintentá.",
  hastaLabel: "Hasta",
  ingresado: "Ingresado",
  ingreso: "Ingresos",
  listo: "Listo",
  loading: "Cargando reportes…",
  login: "Ir a iniciar sesión",
  netByType: "Neto por tipo",
  productsByQuantity: "Más vendidos por cantidad",
  productsByRevenue: "Más vendidos por ingresos",
  repairsTitle: "Reparaciones por estado",
  retry: "Reintentar",
  desdeLabel: "Desde",
  stockTitle: "Valoración de stock",
  ticketCount: "Cantidad de tickets",
  title: "Reportes",
  topProductsTitle: "Productos destacados",
  totalSales: "Ventas totales",
  valuationTotal: "Valoración total",
} as const;

const FILTER_NAMES = ["desde", "hasta"] as const;
type FilterName = (typeof FILTER_NAMES)[number];

const STALE_TIME_MS = 30_000;
const TOP_PRODUCTS_LIMIT = 5;

function useReportFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const period = useUiStore((state) => state.period);
  const range = periodToRange(period);

  const committed = useMemo<Record<FilterName, string>>(
    () => ({
      desde: searchParams.get("desde") ?? range.desde,
      hasta: searchParams.get("hasta") ?? range.hasta,
    }),
    [searchParams, range.desde, range.hasta],
  );

  const [drafts, setDrafts] = useState<Record<FilterName, string>>(committed);

  useEffect(() => {
    setDrafts(committed);
  }, [committed]);

  useEffect(() => {
    const changed = FILTER_NAMES.some((name) => drafts[name] !== committed[name]);
    if (!changed) return undefined;

    const timer = setTimeout(() => {
      const next = new URLSearchParams(searchParams.toString());
      for (const name of FILTER_NAMES) {
        const value = drafts[name];
        if (value === "") next.delete(name);
        else next.set(name, value);
      }
      const query = next.toString();
      router.replace(query === "" ? "/app/reportes" : `/app/reportes?${query}`);
    }, 300);
    return () => clearTimeout(timer);
  }, [committed, drafts, router, searchParams]);

  function setDraft(name: FilterName, value: string): void {
    setDrafts((current) => ({ ...current, [name]: value }));
  }

  return { committed, drafts, setDraft };
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(value);
}

function ReportesPageContent() {
  const actor = useActor();
  const denied = actor === null;
  const { committed, drafts, setDraft } = useReportFilters();

  const dateFilters = useMemo(
    () => ({ from: committed.desde, to: committed.hasta }),
    [committed],
  );

  const topProductsFilters: ReportFilters = useMemo(
    () => ({ ...dateFilters, limit: TOP_PRODUCTS_LIMIT }),
    [dateFilters],
  );

  const salesQuery = useQuery({
    enabled: !denied,
    queryFn: () => getSalesSummary(dateFilters),
    queryKey: ["reports", "sales-summary", dateFilters],
    staleTime: STALE_TIME_MS,
  });

  const cashQuery = useQuery({
    enabled: !denied,
    queryFn: () => getCashSummary(dateFilters),
    queryKey: ["reports", "cash-summary", dateFilters],
    staleTime: STALE_TIME_MS,
  });

  const stockQuery = useQuery({
    enabled: !denied,
    queryFn: getStockValuation,
    queryKey: ["reports", "stock-valuation"],
    staleTime: STALE_TIME_MS,
  });

  const topProductsQuery = useQuery({
    enabled: !denied,
    queryFn: () => getTopProducts(topProductsFilters),
    queryKey: ["reports", "top-products", topProductsFilters],
    staleTime: STALE_TIME_MS,
  });

  const repairsQuery = useQuery({
    enabled: !denied,
    queryFn: getRepairsByStatus,
    queryKey: ["reports", "repairs-by-status"],
    staleTime: STALE_TIME_MS,
  });

  const isLoading =
    salesQuery.isFetching ||
    cashQuery.isFetching ||
    stockQuery.isFetching ||
    topProductsQuery.isFetching ||
    repairsQuery.isFetching;

  const error =
    salesQuery.error ??
    cashQuery.error ??
    stockQuery.error ??
    topProductsQuery.error ??
    repairsQuery.error;

  function handleRetry(): void {
    void salesQuery.refetch();
    void cashQuery.refetch();
    void stockQuery.refetch();
    void topProductsQuery.refetch();
    void repairsQuery.refetch();
  }

  if (denied) {
    return (
      <p role="alert">
        {COPY.denied} <a href="/login">{COPY.login}</a>
      </p>
    );
  }

  return (
    <section aria-labelledby="reportes-title" className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">Módulo</p>
      <h1 className="text-3xl font-semibold tracking-tight text-ink" id="reportes-title">
        {COPY.title}
      </h1>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Input
          label={COPY.desdeLabel}
          onChange={(event) => setDraft("desde", event.target.value)}
          type="date"
          value={drafts.desde}
        />
        <Input
          label={COPY.hastaLabel}
          onChange={(event) => setDraft("hasta", event.target.value)}
          type="date"
          value={drafts.hasta}
        />
      </div>

      {isLoading && !salesQuery.data ? (
        <p>{COPY.loading}</p>
      ) : error ? (
        <p role="alert">
          {COPY.error}{" "}
          <Button onClick={handleRetry} type="button" variant="secondary">
            {COPY.retry}
          </Button>
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-line bg-surface p-4">
              <p className="text-sm text-ink">{COPY.totalSales}</p>
              <p className="text-2xl font-semibold text-ink">
                {formatCurrency(salesQuery.data?.totalSales ?? 0)}
              </p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-4">
              <p className="text-sm text-ink">{COPY.ticketCount}</p>
              <p className="text-2xl font-semibold text-ink">
                {salesQuery.data?.ticketCount ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-4">
              <p className="text-sm text-ink">{COPY.averageTicket}</p>
              <p className="text-2xl font-semibold text-ink">
                {formatCurrency(salesQuery.data?.averageTicket ?? 0)}
              </p>
            </div>
          </div>

          {salesQuery.data && (salesQuery.data.dailySeries?.length ?? 0) > 0 ? (
            <div className="rounded-xl border border-line bg-surface p-4">
              <h2 className="text-lg font-semibold text-ink">{COPY.dailySeries}</h2>
              <table className="mt-2 w-full text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="px-2 py-1 text-left">Fecha</th>
                    <th className="px-2 py-1 text-right">Ventas</th>
                    <th className="px-2 py-1 text-right">Tickets</th>
                  </tr>
                </thead>
                <tbody>
                  {salesQuery.data.dailySeries?.map((day) => (
                    <tr className="border-b border-line last:border-b-0" key={day.date}>
                      <td className="px-2 py-1">{day.date}</td>
                      <td className="px-2 py-1 text-right">{formatCurrency(day.sales)}</td>
                      <td className="px-2 py-1 text-right">{day.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {cashQuery.data ? (
            <div className="rounded-xl border border-line bg-surface p-4">
              <h2 className="text-lg font-semibold text-ink">{COPY.cashTitle}</h2>
              <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-sm text-ink">{COPY.ingreso}</p>
                  <p className="text-xl font-semibold text-ink">
                    {formatCurrency(cashQuery.data.netByType?.ingreso ?? 0)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-ink">{COPY.egreso}</p>
                  <p className="text-xl font-semibold text-ink">
                    {formatCurrency(cashQuery.data.netByType?.egreso ?? 0)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-ink">{COPY.ajuste}</p>
                  <p className="text-xl font-semibold text-ink">
                    {formatCurrency(cashQuery.data.netByType?.ajuste ?? 0)}
                  </p>
                </div>
              </div>
              {(cashQuery.data.sessions ?? []).length > 0 ? (
                <table className="mt-4 w-full text-sm">
                  <thead>
                    <tr className="border-b border-line">
                      <th className="px-2 py-1 text-left">Fecha</th>
                      <th className="px-2 py-1 text-right">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(cashQuery.data.sessions ?? []).map((session) => (
                      <tr className="border-b border-line last:border-b-0" key={session.date}>
                        <td className="px-2 py-1">{session.date}</td>
                        <td className="px-2 py-1 text-right">
                          {formatCurrency(session.difference)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </div>
          ) : null}

          {stockQuery.data ? (
            <div className="rounded-xl border border-line bg-surface p-4">
              <h2 className="text-lg font-semibold text-ink">{COPY.stockTitle}</h2>
              <p className="mt-1 text-sm text-ink">
                {COPY.valuationTotal}: {formatCurrency(stockQuery.data.total)}
              </p>
              {stockQuery.data.items.length > 0 ? (
                <table className="mt-2 w-full text-sm">
                  <thead>
                    <tr className="border-b border-line">
                      <th className="px-2 py-1 text-left">Producto</th>
                      <th className="px-2 py-1 text-right">Stock</th>
                      <th className="px-2 py-1 text-right">Precio</th>
                      <th className="px-2 py-1 text-right">Valuación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockQuery.data.items.map((item) => (
                      <tr className="border-b border-line last:border-b-0" key={item.productId}>
                        <td className="px-2 py-1">
                          {item.name}{" "}
                          {item.lowStock ? (
                            <span className="text-danger">(bajo)</span>
                          ) : null}
                        </td>
                        <td className="px-2 py-1 text-right">{item.stock}</td>
                        <td className="px-2 py-1 text-right">{formatCurrency(item.price)}</td>
                        <td className="px-2 py-1 text-right">{formatCurrency(item.valuation)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="mt-2 text-sm text-ink">{COPY.empty}</p>
              )}
            </div>
          ) : null}

          {topProductsQuery.data ? (
            <div className="rounded-xl border border-line bg-surface p-4">
              <h2 className="text-lg font-semibold text-ink">{COPY.topProductsTitle}</h2>
              <div className="mt-2 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div>
                  <h3 className="text-sm font-medium text-ink">{COPY.productsByQuantity}</h3>
                  {topProductsQuery.data.byQuantity.length > 0 ? (
                    <ul className="mt-1 text-sm">
                      {topProductsQuery.data.byQuantity.map((product) => (
                        <li key={product.productId}>
                          {product.name}: {product.quantity}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-ink">{COPY.empty}</p>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-medium text-ink">{COPY.productsByRevenue}</h3>
                  {topProductsQuery.data.byRevenue.length > 0 ? (
                    <ul className="mt-1 text-sm">
                      {topProductsQuery.data.byRevenue.map((product) => (
                        <li key={product.productId}>
                          {product.name}: {formatCurrency(product.revenue)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-ink">{COPY.empty}</p>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {repairsQuery.data ? (
            <div className="rounded-xl border border-line bg-surface p-4">
              <h2 className="text-lg font-semibold text-ink">{COPY.repairsTitle}</h2>
              <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                <div>
                  <p className="text-sm text-ink">{COPY.ingresado}</p>
                  <p className="text-xl font-semibold text-ink">
                    {repairsQuery.data.counts.Ingresado}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-ink">{COPY.enReparacion}</p>
                  <p className="text-xl font-semibold text-ink">
                    {repairsQuery.data.counts.EnReparacion}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-ink">{COPY.listo}</p>
                  <p className="text-xl font-semibold text-ink">{repairsQuery.data.counts.Listo}</p>
                </div>
                <div>
                  <p className="text-sm text-ink">{COPY.entregado}</p>
                  <p className="text-xl font-semibold text-ink">
                    {repairsQuery.data.counts.Entregado}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-ink">{COPY.cancelado}</p>
                  <p className="text-xl font-semibold text-ink">
                    {repairsQuery.data.counts.Cancelado}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

export default function ReportesPage() {
  return (
    <Suspense fallback={<p>{COPY.loading}</p>}>
      <ReportesPageContent />
    </Suspense>
  );
}
