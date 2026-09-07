"use client";

import { Suspense, useEffect, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { VentaAnularModal } from "../../../src/components/features/VentaAnularModal";
import { VentaCreateModal } from "../../../src/components/features/VentaCreateModal";
import { VentasTable, type VentaListRow } from "../../../src/components/features/VentasTable";
import { useUiStore } from "../../../src/lib/ui-store";
import type { Role } from "../../../src/server/handlers/auth";
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const setCreateOpen = useUiStore((state) => state.setVentaCreateModalOpen);
  const setAnularId = useUiStore((state) => state.setVentaAnularModalId);
  const [canCreate, setCanCreate] = useState(false);
  const [canAnular, setCanAnular] = useState(false);
  const [denied, setDenied] = useState(false);

  const qParam = searchParams.get("q") ?? "";
  const rawEstado = searchParams.get("estado") ?? "all";
  const estado = rawEstado === "confirmada" || rawEstado === "anulada" ? rawEstado : "all";
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const [draft, setDraft] = useState(qParam);

  useEffect(() => {
    setDraft(qParam);
  }, [qParam]);

  useEffect(() => {
    if (draft === qParam) return undefined;
    const timer = setTimeout(() => {
      updateParams({ page: "", q: draft });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const { data, error, isFetching, refetch } = useQuery({
    enabled: !denied,
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page) });
      if (estado !== "all") params.set("estado", estado);
      if (qParam !== "") params.set("q", qParam);
      const response = await fetch(`/api/gestion/ventas?${params.toString()}`, { cache: "no-store" });
      if (response.status === 401 || response.status === 403) {
        setDenied(true);
        throw new Error(COPY.denied);
      }
      if (!response.ok) throw new Error(COPY.error);
      return asVentasPayload(await response.json());
    },
    queryKey: ["ventas", { estado, page, q: qParam }],
    staleTime: 30_000
  });

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
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === "") params.delete(key);
      else params.set(key, value);
    }
    const query = params.toString();
    router.replace(query === "" ? "/app/ventas" : `/app/ventas?${query}`);
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
                onChange={(event) => setDraft(event.target.value)}
                placeholder={COPY.searchPlaceholder}
                value={draft}
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
