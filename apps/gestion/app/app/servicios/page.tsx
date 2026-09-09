"use client";

import { Suspense, useEffect, useState } from "react";

import { ServicioDeactivateModal } from "../../../src/components/features/ServicioDeactivateModal";
import { ServicioFormModal } from "../../../src/components/features/ServicioFormModal";
import { ServiciosTable, type ServicioListRow } from "../../../src/components/features/ServiciosTable";
import { SERVICIO_WRITE_ROLES } from "../../../src/lib/domain/services/servicio";
import { useListQuery } from "../../../src/components/useListQuery";
import { useUiStore } from "../../../src/lib/ui-store";
import type { Role } from "../../../src/kernel/role";
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toServicioRow(value: unknown): ServicioListRow | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.displayName !== "string") return null;
  if (typeof value.price !== "number" || typeof value.active !== "boolean") return null;
  if (typeof value.version !== "number") return null;
  return {
    active: value.active,
    displayName: value.displayName,
    id: value.id,
    price: value.price,
    version: value.version
  };
}

interface ServiciosPayload {
  readonly items: readonly ServicioListRow[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
}

function asServiciosPayload(payload: unknown): ServiciosPayload {
  if (!isRecord(payload) || !isRecord(payload.data)) throw new Error(COPY.error);
  const data = payload.data;
  const rawItems = Array.isArray(data.items) ? data.items : [];
  return {
    items: rawItems.map(toServicioRow).filter((row): row is ServicioListRow => row !== null),
    page: typeof data.page === "number" ? data.page : 1,
    pageSize: typeof data.pageSize === "number" ? data.pageSize : 25,
    totalItems: typeof data.totalItems === "number" ? data.totalItems : 0
  };
}

interface SessionActor {
  readonly role: string;
}

function isSessionActor(value: unknown): value is SessionActor {
  return isRecord(value) && typeof value.role === "string";
}

function ServiciosPageContent() {
  const setCreateOpen = useUiStore((state) => state.setServicioCreateOpen);
  const setEditing = useUiStore((state) => state.setServicioEditing);
  const setDeactivating = useUiStore((state) => state.setServicioDeactivating);
  const [canManage, setCanManage] = useState(false);

  const { denied, drafts, params, query, setDraft, setParams } = useListQuery<ServiciosPayload>({
    apiPath: "/api/gestion/servicios",
    authError: COPY.denied,
    basePath: "/app/servicios",
    defaults: { active: "true" },
    key: "servicios",
    loadError: COPY.error,
    normalize: (committed) => ({
      ...committed,
      active: committed["active"] === "false" ? "false" : committed["active"] === "all" ? "all" : "true"
    }),
    params: ["active", "page", "q"],
    parse: asServiciosPayload
  });
  const { data, error, isFetching, refetch } = query;
  const active = params["active"] ?? "true";

  useEffect(() => {
    let active = true;
    fetch("/api/gestion/auth/session", { cache: "no-store" })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (active && response.ok && isRecord(payload) && isSessionActor(payload.data)) {
          setCanManage(SERVICIO_WRITE_ROLES.has(payload.data.role as Role));
        }
      })
      .catch(() => {
        // El botón Nuevo es solo un acceso; la defensa real es server-side.
      });
    return () => {
      active = false;
    };
  }, []);

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
                value={drafts["q"] ?? ""}
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
                value={active}
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
