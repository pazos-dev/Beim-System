"use client";

import { Suspense, useState } from "react";

import { useListQuery } from "../../../src/components/useListQuery";
import { useUiSliceStore } from "../../../src/store/ui.slice";
import { periodToRange } from "../../../src/lib/period-range";
import type { PeriodSnapshot } from "../../../src/lib/domain/reports/reports";
import { Button } from "../../../src/components/ui/Button";
import { Input } from "../../../src/components/ui/Input";

const COPY = {
  csv: "Descargar CSV",
  denied: "Tu sesión no es válida. Iniciá sesión para ver los reportes.",
  desdeLabel: "Desde",
  empty: "No hay movimientos para el período seleccionado.",
  error: "No se pudo cargar el reporte. Reintentá.",
  formatoLabel: "Formato",
  gastos: "Gastos totales",
  hastaLabel: "Hasta",
  loading: "Cargando reporte…",
  login: "Ir a iniciar sesión",
  neto: "Neto del período",
  origenApi: "Origen: API",
  origenLocal: "Origen: local",
  porDia: "Ventas por día",
  porMetodo: "Ventas por método de pago",
  promedio: "Promedio por ticket",
  retry: "Reintentar",
  title: "Reportes",
  totalCompras: "Total de compras",
  ventasCantidad: "Cantidad de ventas",
  ventasDevoluciones: "Devoluciones",
  ventasDevolucionesLocal: "Devoluciones (local)",
  ventasNetas: "Ventas netas"
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asSnapshot(payload: unknown): PeriodSnapshot {
  if (!isRecord(payload) || !isRecord(payload.data)) throw new Error(COPY.error);
  return payload.data as unknown as PeriodSnapshot;
}

function ReportesPageContent() {
  const period = useUiSliceStore((state) => state.period);
  const range = periodToRange(period);
  const [formato, setFormato] = useState<"json" | "csv">("json");

  const { denied, drafts, query, setDraft } = useListQuery<PeriodSnapshot>({
    apiPath: "/api/gestion/reportes",
    authError: COPY.denied,
    basePath: "/app/reportes",
    defaults: { desde: range.desde, hasta: range.hasta },
    key: "reportes",
    loadError: COPY.error,
    params: ["desde", "hasta"],
    parse: asSnapshot
  });
  const { data, error, isFetching, refetch } = query;

  const csvHref =
    data === undefined
      ? null
      : `/api/gestion/reportes?${new URLSearchParams({ desde: data.desde, hasta: data.hasta, formato: "csv" }).toString()}`;

  return (
    <section aria-labelledby="reportes-title" className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">Módulo</p>
      <h1 className="text-3xl font-semibold tracking-tight text-ink" id="reportes-title">
        {COPY.title}
      </h1>

      {denied ? (
        <p role="alert">
          {COPY.denied} <a href="/login">{COPY.login}</a>
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Input
                label={COPY.desdeLabel}
                onChange={(event) => setDraft("desde", event.target.value)}
                type="date"
                value={drafts["desde"] ?? ""}
              />
            </div>
            <div className="flex-1">
              <Input
                label={COPY.hastaLabel}
                onChange={(event) => setDraft("hasta", event.target.value)}
                type="date"
                value={drafts["hasta"] ?? ""}
              />
            </div>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
              {COPY.formatoLabel}
              <select
                aria-label={COPY.formatoLabel}
                className="min-h-10 rounded-md border border-line bg-surface px-3 py-2 text-ink"
                onChange={(event) => setFormato(event.target.value === "csv" ? "csv" : "json")}
                value={formato}
              >
                <option value="json">Tabla</option>
                <option value="csv">CSV</option>
              </select>
            </label>
          </div>
          {formato === "csv" && csvHref !== null ? (
            <p>
              <a className="font-medium text-brand-strong underline" href={csvHref}>
                {COPY.csv}
              </a>
            </p>
          ) : null}
          {isFetching && data === undefined ? (
            <p>{COPY.loading}</p>
          ) : error ? (
            <p role="alert">
              {COPY.error}{" "}
              <Button onClick={() => void refetch()} type="button" variant="secondary">
                {COPY.retry}
              </Button>
            </p>
          ) : data ? (
            <>
              <p className="text-xs text-ink">
                {data.source === "api" ? COPY.origenApi : COPY.origenLocal}
              </p>
              <table className="w-full border-collapse rounded-xl border border-line bg-surface text-sm">
              <caption className="sr-only">
                Resumen del {data.desde} al {data.hasta}
              </caption>
              <tbody>
                <tr className="border-b border-line">
                  <th className="px-4 py-2 text-left font-medium text-ink" scope="row">
                    {COPY.ventasNetas}
                  </th>
                  <td className="px-4 py-2 text-right text-ink">{data.ventas.netas}</td>
                </tr>
                <tr className="border-b border-line">
                  <th className="px-4 py-2 text-left font-medium text-ink" scope="row">
                    {COPY.ventasCantidad}
                  </th>
                  <td className="px-4 py-2 text-right text-ink">{data.ventas.cantidad}</td>
                </tr>
                <tr className="border-b border-line">
                  <th className="px-4 py-2 text-left font-medium text-ink" scope="row">
                    {data.source === "api" ? COPY.ventasDevolucionesLocal : COPY.ventasDevoluciones}
                  </th>
                  <td className="px-4 py-2 text-right text-ink">{data.ventas.devoluciones}</td>
                </tr>
                <tr className="border-b border-line">
                  <th className="px-4 py-2 text-left font-medium text-ink" scope="row">
                    {COPY.totalCompras}
                  </th>
                  <td className="px-4 py-2 text-right text-ink">
                    {data.compras.total} ({data.compras.cantidad})
                  </td>
                </tr>
                <tr className="border-b border-line">
                  <th className="px-4 py-2 text-left font-medium text-ink" scope="row">
                    {COPY.gastos}
                  </th>
                  <td className="px-4 py-2 text-right text-ink">{data.gastos.total}</td>
                </tr>
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-ink" scope="row">
                    {COPY.neto}
                  </th>
                  <td className="px-4 py-2 text-right font-semibold text-ink">{data.neto}</td>
                </tr>
              </tbody>
            </table>
            {data.ventasApi ? (
              <section aria-label={COPY.promedio} className="flex flex-col gap-2">
                <p className="text-sm text-ink">
                  {COPY.promedio}: {data.ventasApi.promedio}
                </p>
                <h2 className="text-lg font-semibold text-ink">{COPY.porDia}</h2>
                <ul className="flex flex-col gap-1 text-sm text-ink">
                  {data.ventasApi.byDay.map((day) => (
                    <li key={day.date}>
                      {day.date}: {day.total} ({day.count})
                    </li>
                  ))}
                </ul>
                <h2 className="text-lg font-semibold text-ink">{COPY.porMetodo}</h2>
                <ul className="flex flex-col gap-1 text-sm text-ink">
                  {data.ventasApi.byMethod.map((row) => (
                    <li key={row.method}>
                      {row.label}: {row.total} ({row.count})
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            </>
          ) : (
            <p>{COPY.empty}</p>
          )}
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
