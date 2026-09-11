"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { VentaAnularModal } from "../../../src/components/features/VentaAnularModal";
import { VentaCreateModal } from "../../../src/components/features/VentaCreateModal";
import { VentasTable, type VentaListRow } from "../../../src/components/features/VentasTable";
import { useActor } from "../../../src/lib/api/auth-store";
import { ventaRepository, type VentaListResponse } from "../../../src/lib/api/venta-repository";
import { Button } from "../../../src/components/ui/Button";
import { Input } from "../../../src/components/ui/Input";
import { useUiStore } from "../../../src/lib/ui-store";

// Los roles son solo acceso: la defensa real es server-side
// (SALE_CREATE_ROLES y VENTA_ANULAR_ROLES en src/server).
const VENTA_CREATE_ROLES: ReadonlySet<string> = new Set([
  "vendedor",
  "caja",
  "administrador",
  "administrador_principal"
]);
const VENTA_ANULAR_ROLES: ReadonlySet<string> = new Set(["administrador", "administrador_principal"]);

const COPY = {
  denied: "Tu sesión no es válida. Iniciá sesión para ver las ventas.",
  error: "No se pudieron cargar las ventas. Reintentá.",
  estadoFilter: "Filtrar por estado",
  loading: "Cargando ventas…",
  login: "Ir a iniciar sesión",
  newSale: "Nueva venta",
  next: "Siguiente",
  previous: "Anterior",
  retry: "Reintentar",
  searchLabel: "Buscar ventas",
  searchPlaceholder: "Número…",
  title: "Ventas"
} as const;

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;
const STALE_TIME_MS = 30_000;

type EstadoFilter = "all" | "confirmada" | "anulada";

interface VentasPayload {
  readonly items: readonly VentaListRow[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toVentaRow(value: unknown): VentaListRow | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.numero !== "string") return null;
  if (typeof value.total !== "number" || typeof value.version !== "number") return null;
  if (value.estado !== "confirmada" && value.estado !== "anulada") return null;
  return {
    estado: value.estado,
    ...(typeof value.fecha === "string" ? { fecha: value.fecha } : {}),
    id: value.id,
    numero: value.numero,
    total: value.total,
    version: value.version
  };
}

function asVentasPayload(response: VentaListResponse): VentasPayload {
  return {
    items: response.items.map(toVentaRow).filter((row): row is VentaListRow => row !== null),
    page: response.page,
    pageSize: response.limit,
    totalItems: response.total
  };
}

interface FilterParams {
  readonly estado: EstadoFilter;
  readonly page: number;
  readonly q: string;
}

function normalizeEstado(value: string | null): EstadoFilter {
  if (value === "confirmada" || value === "anulada") return value;
  return "all";
}

function normalizePage(value: string | null): number {
  return Math.max(1, Number.parseInt(value ?? "1", 10) || 1);
}

function readParams(searchParams: URLSearchParams): FilterParams {
  return {
    estado: normalizeEstado(searchParams.get("estado")),
    page: normalizePage(searchParams.get("page")),
    q: searchParams.get("q") ?? ""
  };
}

function buildHref(basePath: string, current: URLSearchParams, next: Record<string, string>): string {
  const params = new URLSearchParams(current.toString());
  for (const [key, value] of Object.entries(next)) {
    if (value === "") params.delete(key);
    else params.set(key, value);
  }
  const query = params.toString();
  return query === "" ? basePath : `${basePath}?${query}`;
}

function useVentasFilters() {
  const router = useRouter();
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const searchString = searchParams.toString();
  const params = useMemo(() => readParams(searchParams), [searchString]);
  const [drafts, setDrafts] = useState<FilterParams>(params);

  useEffect(() => {
    setDrafts(params);
  }, [params]);

  useEffect(() => {
    if (drafts.q === params.q) return undefined;
    const timer = setTimeout(() => {
      router.replace(buildHref("/app/ventas", searchParams, { q: drafts.q, page: "" }));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [drafts.q, params.q, router, searchString]);

  const setParams = (next: Record<string, string>): void => {
    router.replace(buildHref("/app/ventas", searchParams, next));
  };

  const setDraft = (name: keyof FilterParams, value: string): void => {
    setDrafts((current) => ({ ...current, [name]: value }));
  };

  return { drafts, params, setDraft, setParams };
}

function VentasPageContent() {
  const setCreateOpen = useUiStore((state) => state.setVentaCreateModalOpen);
  const setAnularId = useUiStore((state) => state.setVentaAnularModalId);
  const actor = useActor();
  const canCreate = actor !== null && VENTA_CREATE_ROLES.has(actor.role);
  const canAnular = actor !== null && VENTA_ANULAR_ROLES.has(actor.role);
  const [denied, setDenied] = useState(actor === null);

  useEffect(() => {
    setDenied(actor === null);
  }, [actor]);

  const { drafts, params, setDraft, setParams } = useVentasFilters();

  const statusParam = params.estado === "all" ? undefined : params.estado;

  const { data, error, isFetching, refetch } = useQuery<VentasPayload, Error>({
    enabled: !denied,
    queryFn: async () => {
      const envelope = await ventaRepository.list({
        client: params.q,
        limit: PAGE_SIZE,
        page: params.page,
        status: statusParam,
        type: "sale"
      });

      if (!envelope.ok) {
        if (envelope.error?.code === "AUTHENTICATION_REQUIRED" || envelope.error?.code === "FORBIDDEN") {
          setDenied(true);
        }
        throw new Error(COPY.error);
      }

      if (envelope.data === undefined) {
        throw new Error(COPY.error);
      }

      return asVentasPayload(envelope.data);
    },
    queryKey: ["ventas", { client: params.q, page: params.page, status: statusParam, type: "sale" }],
    staleTime: STALE_TIME_MS
  });

  function updateParams(next: Record<string, string>): void {
    setParams(next);
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.totalItems / Math.max(1, data.pageSize))) : 1;

  if (denied) {
    return (
      <section aria-labelledby="ventas-title" className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">Módulo</p>
        <h1 className="text-3xl font-semibold tracking-tight text-ink" id="ventas-title">
          {COPY.title}
        </h1>
        <p role="alert">
          {COPY.denied} <a href="/login">{COPY.login}</a>
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="ventas-title" className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">Módulo</p>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight text-ink" id="ventas-title">
          {COPY.title}
        </h1>
        {canCreate ? (
          <Button onClick={() => setCreateOpen(true)} type="button">
            {COPY.newSale}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Input
            label={COPY.searchLabel}
            onChange={(event) => setDraft("q", event.target.value)}
            placeholder={COPY.searchPlaceholder}
            value={drafts.q}
          />
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          {COPY.estadoFilter}
          <select
            aria-label={COPY.estadoFilter}
            className="min-h-10 rounded-md border border-line bg-surface px-3 py-2 text-ink"
            onChange={(event) =>
              updateParams({ estado: event.target.value === "all" ? "" : event.target.value, page: "" })
            }
            value={params.estado}
          >
            <option value="all">Todas</option>
            <option value="confirmada">Confirmadas</option>
            <option value="anulada">Anuladas</option>
          </select>
        </label>
      </div>
      <VentasTable
        canAnular={canAnular}
        error={error ? COPY.error : null}
        isLoading={isFetching}
        items={data?.items ?? []}
        onAnular={(row) => setAnularId(row.id)}
        onRetry={() => void refetch()}
      />
      {data && data.totalItems > 0 ? (
        <nav aria-label="Paginación de ventas" className="flex items-center justify-between">
          <Button
            disabled={data.page <= 1}
            onClick={() => updateParams({ page: String(data.page - 1) })}
            type="button"
            variant="secondary"
          >
            {COPY.previous}
          </Button>
          <p className="text-sm text-ink-muted">
            Página {data.page} de {totalPages}
          </p>
          <Button
            disabled={data.page >= totalPages}
            onClick={() => updateParams({ page: String(data.page + 1) })}
            type="button"
            variant="secondary"
          >
            {COPY.next}
          </Button>
        </nav>
      ) : null}

      <VentaCreateModal />
      <VentaAnularModal />
    </section>
  );
}

export default function VentasPage() {
  return (
    <Suspense fallback={<p>{COPY.loading}</p>}>
      <VentasPageContent />
    </Suspense>
  );
}
