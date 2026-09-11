"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { ServicioDeactivateModal } from "../../../src/components/features/ServicioDeactivateModal";
import { ServicioFormModal } from "../../../src/components/features/ServicioFormModal";
import { ServiciosTable, type ServicioListRow } from "../../../src/components/features/ServiciosTable";
import { SERVICIO_WRITE_ROLES } from "../../../src/lib/domain/services/servicio";
import { servicioRepository, type Servicio, type ServicioListResponse } from "../../../src/lib/api/servicio-repository";
import { useActor } from "../../../src/lib/api/auth-store";
import { useUiStore } from "../../../src/lib/ui-store";
import { Button } from "../../../src/components/ui/Button";
import { Input } from "../../../src/components/ui/Input";

const COPY = {
  activeFilter: "Filtrar por estado",
  denied: "Tu sesión no es válida. Iniciá sesión para ver los servicios.",
  error: "No se pudieron cargar los servicios. Reintentá.",
  loading: "Cargando servicios…",
  login: "Ir a iniciar sesión",
  newService: "Nuevo servicio",
  next: "Siguiente",
  previous: "Anterior",
  retry: "Reintentar",
  searchLabel: "Buscar servicios",
  searchPlaceholder: "Nombre del servicio…",
  title: "Servicios"
} as const;

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;
const STALE_TIME_MS = 30_000;

type ActiveFilter = "true" | "false" | "all";

interface ServiciosPayload {
  readonly items: readonly ServicioListRow[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
}

function toServicioRow(servicio: Servicio): ServicioListRow {
  return {
    active: servicio.active,
    displayName: servicio.displayName,
    id: servicio.id,
    price: servicio.price,
    version: servicio.version
  };
}

function asServiciosPayload(response: ServicioListResponse): ServiciosPayload {
  return {
    items: response.items.map(toServicioRow),
    page: response.page,
    pageSize: response.pageSize,
    totalItems: response.totalItems
  };
}

interface FilterParams {
  readonly active: ActiveFilter;
  readonly page: number;
  readonly q: string;
}

function normalizeActive(value: string | null): ActiveFilter {
  if (value === "false") return "false";
  if (value === "all") return "all";
  return "true";
}

function normalizePage(value: string | null): number {
  return Math.max(1, Number.parseInt(value ?? "1", 10) || 1);
}

function readParams(searchParams: URLSearchParams): FilterParams {
  return {
    active: normalizeActive(searchParams.get("active")),
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

function useServiciosFilters() {
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
      router.replace(buildHref("/app/servicios", searchParams, { q: drafts.q, page: "" }));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [drafts.q, params.q, router, searchString]);

  const setParams = (next: Record<string, string>): void => {
    router.replace(buildHref("/app/servicios", searchParams, next));
  };

  const setDraft = (name: keyof FilterParams, value: string): void => {
    setDrafts((current) => ({ ...current, [name]: value }));
  };

  return { drafts, params, setDraft, setParams };
}

function ServiciosPageContent() {
  const setCreateOpen = useUiStore((state) => state.setServicioCreateOpen);
  const setEditing = useUiStore((state) => state.setServicioEditing);
  const setDeactivating = useUiStore((state) => state.setServicioDeactivating);
  const actor = useActor();
  const canManage = actor !== null && SERVICIO_WRITE_ROLES.has(actor.role);

  const { drafts, params, setDraft, setParams } = useServiciosFilters();
  const [denied, setDenied] = useState(actor === null);

  useEffect(() => {
    setDenied(actor === null);
  }, [actor]);

  const activeParam = params.active === "all" ? undefined : params.active;

  const { data, error, isFetching, refetch } = useQuery<ServiciosPayload, Error>({
    enabled: !denied,
    queryFn: async () => {
      const envelope = await servicioRepository.list({
        active: activeParam,
        page: params.page,
        q: params.q
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

      return asServiciosPayload(envelope.data);
    },
    queryKey: ["servicios", { active: activeParam, page: params.page, q: params.q }],
    staleTime: STALE_TIME_MS
  });

  function updateParams(next: Record<string, string>): void {
    setParams(next);
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.totalItems / Math.max(1, data.pageSize))) : 1;

  return (
    <section aria-labelledby="servicios-title" className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">Módulo</p>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight text-ink" id="servicios-title">
          {COPY.title}
        </h1>
        {canManage ? (
          <Button onClick={() => setCreateOpen(true)} type="button">
            {COPY.newService}
          </Button>
        ) : null}
      </div>

      {denied ? (
        <p role="alert">
          {COPY.denied} <a href="/login">{COPY.login}</a>
        </p>
      ) : (
        <>
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
              {COPY.activeFilter}
              <select
                aria-label={COPY.activeFilter}
                className="min-h-10 rounded-md border border-line bg-surface px-3 py-2 text-ink"
                onChange={(event) =>
                  updateParams({ active: event.target.value === "true" ? "" : event.target.value, page: "" })
                }
                value={params.active}
              >
                <option value="true">Activos</option>
                <option value="false">Inactivos</option>
                <option value="all">Todos</option>
              </select>
            </label>
          </div>
          <ServiciosTable
            canManage={canManage}
            error={error ? COPY.error : null}
            isLoading={isFetching}
            items={data?.items ?? []}
            onDeactivate={(row) => setDeactivating(row)}
            onEdit={(row) => setEditing(row)}
            onRetry={() => void refetch()}
          />
          {data && data.totalItems > 0 ? (
            <nav aria-label="Paginación de servicios" className="flex items-center justify-between">
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
        </>
      )}

      <ServicioFormModal />
      <ServicioDeactivateModal />
    </section>
  );
}

export default function ServiciosPage() {
  return (
    <Suspense fallback={<p>{COPY.loading}</p>}>
      <ServiciosPageContent />
    </Suspense>
  );
}
