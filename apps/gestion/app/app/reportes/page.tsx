"use client";

import { Suspense, useEffect, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { ReportesPanel } from "../../../src/components/features/ReportesPanel";
import { useUiStore } from "../../../src/lib/ui-store";
import type { Role } from "../../../src/server/handlers/auth";
import type { PeriodSnapshot } from "../../../src/lib/domain/reports/reports";
import { Input } from "../../../src/components/ui/Input";
import { useToast } from "../../../src/components/ui/Toast";

// Read-only roles mirror the server gate (REPORT_ROLES in the route):
// the real enforcement stays server-side.
const REPORT_READ_ROLES: ReadonlySet<string> = new Set([
  "caja",
  "administrador",
  "administrador_principal"
]);

const COPY = {
  denied: "Tu sesión no es válida. Iniciá sesión para ver los reportes.",
  desdeLabel: "Desde",
  empty: "No hay datos para el período seleccionado.",
  error: "No se pudo cargar el reporte. Reintentá.",
  exportDone: "Reporte exportado correctamente.",
  hastaLabel: "Hasta",
  loading: "Cargando reporte…",
  login: "Ir a iniciar sesión",
  title: "Reportes"
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asSnapshot(payload: unknown): PeriodSnapshot {
  if (!isRecord(payload) || !isRecord(payload.data)) throw new Error(COPY.error);
  const data = payload.data;
  if (!isRecord(data.ventas) || !isRecord(data.compras) || !isRecord(data.gastos)) {
    throw new Error(COPY.error);
  }
  if (
    typeof data.ventas.netas !== "number" ||
    typeof data.ventas.cantidad !== "number" ||
    typeof data.ventas.devoluciones !== "number" ||
    typeof data.compras.total !== "number" ||
    typeof data.compras.cantidad !== "number" ||
    typeof data.gastos.total !== "number" ||
    !Array.isArray(data.gastos.porCategoria) ||
    typeof data.neto !== "number" ||
    typeof data.desde !== "string" ||
    typeof data.hasta !== "string"
  ) {
    throw new Error(COPY.error);
  }
  return data as unknown as PeriodSnapshot;
}

function currentMonthBounds(): { desde: string; hasta: string } {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const lastDay = String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, "0");
  return { desde: `${now.getFullYear()}-${month}-01`, hasta: `${now.getFullYear()}-${month}-${lastDay}` };
}

interface SessionActor {
  readonly role: string;
}

function isSessionActor(value: unknown): value is SessionActor {
  return isRecord(value) && typeof value.role === "string";
}

function ReportesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const periodDraft = useUiStore((state) => state.reportePeriodDraft);
  const setPeriodDraft = useUiStore((state) => state.setReportePeriodDraft);
  const setExportState = useUiStore((state) => state.setReporteExportState);
  const [canExport, setCanExport] = useState(false);
  const [denied, setDenied] = useState(false);

  const fallback = currentMonthBounds();
  const desde = searchParams.get("desde") ?? fallback.desde;
  const hasta = searchParams.get("hasta") ?? fallback.hasta;

  useEffect(() => {
    setPeriodDraft({ desde, hasta });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta]);

  function updateParams(next: Record<string, string>): void {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === "") params.delete(key);
      else params.set(key, value);
    }
    const query = params.toString();
    router.replace(query === "" ? "/app/reportes" : `/app/reportes?${query}`);
  }

  useEffect(() => {
    if (periodDraft.desde === desde && periodDraft.hasta === hasta) return undefined;
    if (periodDraft.desde === "" || periodDraft.hasta === "") return undefined;
    const timer = setTimeout(() => {
      updateParams({ desde: periodDraft.desde, hasta: periodDraft.hasta });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodDraft, desde, hasta]);

  const { data, error, isFetching, refetch } = useQuery({
    enabled: !denied && desde !== "" && hasta !== "",
    queryFn: async () => {
      const params = new URLSearchParams({ desde, hasta, formato: "json" });
      const response = await fetch(`/api/gestion/reportes?${params.toString()}`, { cache: "no-store" });
      if (response.status === 401 || response.status === 403) {
        setDenied(true);
        throw new Error(COPY.denied);
      }
      if (!response.ok) throw new Error(COPY.error);
      return asSnapshot(await response.json());
    },
    queryKey: ["reportes", { desde, hasta }],
    staleTime: 30_000
  });

  useEffect(() => {
    let active = true;
    fetch("/api/gestion/auth/session", { cache: "no-store" })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (active && response.ok && isRecord(payload) && isSessionActor(payload.data)) {
          setCanExport(REPORT_READ_ROLES.has(payload.data.role as Role));
        }
      })
      .catch(() => {
        // Export visibility is advisory only; the server enforces access.
      });
    return () => {
      active = false;
    };
  }, []);

  const exportHref =
    data && canExport
      ? `/api/gestion/reportes?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}&formato=csv`
      : null;

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
                onChange={(event) => setPeriodDraft({ ...periodDraft, desde: event.target.value })}
                type="date"
                value={periodDraft.desde}
              />
            </div>
            <div className="flex-1">
              <Input
                label={COPY.hastaLabel}
                onChange={(event) => setPeriodDraft({ ...periodDraft, hasta: event.target.value })}
                type="date"
                value={periodDraft.hasta}
              />
            </div>
          </div>
          <ReportesPanel
            error={error ? COPY.error : null}
            exportHref={exportHref}
            isLoading={isFetching && !data}
            onExported={() => {
              setExportState("exported");
              toast.success(COPY.exportDone);
            }}
            onRetry={() => void refetch()}
            snapshot={data ?? null}
          />
          {!data && !isFetching && !error ? <p>{COPY.empty}</p> : null}
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
