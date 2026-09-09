"use client";

import { Suspense, useEffect, useState } from "react";

import { VentaAnularModal } from "../../../src/components/features/VentaAnularModal";
import { VentaCreateModal } from "../../../src/components/features/VentaCreateModal";
import { VentasTable, type VentaListRow } from "../../../src/components/features/VentasTable";
import { useListQuery } from "../../../src/components/useListQuery";
import { useUiStore } from "../../../src/lib/ui-store";
import type { Role } from "../../../src/kernel/role";
import { Button } from "../../../src/components/ui/Button";
import { Input } from "../../../src/components/ui/Input";

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

interface VentasPayload {
  readonly items: readonly VentaListRow[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
}

function asVentasPayload(payload: unknown): VentasPayload {
  if (!isRecord(payload) || !isRecord(payload.data)) throw new Error(COPY.error);
  const data = payload.data;
  const rawItems = Array.isArray(data.items) ? data.items : [];
  return {
    items: rawItems.map(toVentaRow).filter((row): row is VentaListRow => row !== null),
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

function VentasPageContent() {
  const setCreateOpen = useUiStore((state) => state.setVentaCreateModalOpen);
  const setAnularId = useUiStore((state) => state.setVentaAnularModalId);
  const [canCreate, setCanCreate] = useState(false);
  const [canAnular, setCanAnular] = useState(false);

  const { denied, drafts, params, query, setDraft, setParams } = useListQuery<VentasPayload>({
    apiPath: "/api/gestion/ventas",
    authError: COPY.denied,
    basePath: "/app/ventas",
    buildRequest: (committed) => {
      const search = new URLSearchParams({ page: committed["page"] ?? "1" });
      if (committed["estado"] !== "all" && committed["estado"] !== "") search.set("estado", committed["estado"] ?? "");
      if (committed["q"] !== "") search.set("q", committed["q"] ?? "");
      return search.toString();
    },
    defaults: { estado: "all" },
    key: "ventas",
    loadError: COPY.error,
    normalize: (committed) => ({
      ...committed,
      estado: committed["estado"] === "confirmada" || committed["estado"] === "anulada" ? committed["estado"] : "all"
    }),
    params: ["q", "estado", "page"],
    parse: asVentasPayload
  });
  const { data, error, isFetching, refetch } = query;
  const estado = params["estado"] ?? "all";

  useEffect(() => {
    let active = true;
    fetch("/api/gestion/auth/session", { cache: "no-store" })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (active && response.ok && isRecord(payload) && isSessionActor(payload.data)) {
          const role = payload.data.role as Role;
          setCanCreate(VENTA_CREATE_ROLES.has(role));
          setCanAnular(VENTA_ANULAR_ROLES.has(role));
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
              {COPY.estadoFilter}
              <select
                aria-label={COPY.estadoFilter}
                className="min-h-10 rounded-md border border-line bg-surface px-3 py-2 text-ink"
                onChange={(event) =>
                  updateParams({ estado: event.target.value === "all" ? "" : event.target.value, page: "" })
                }
                value={estado}
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
        </>
      )}

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
