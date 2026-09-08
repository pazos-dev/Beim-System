"use client";

import { Suspense, useEffect, useState } from "react";

import { ClienteCreateModal } from "../../../src/components/features/ClienteCreateModal";
import { ClientesTable, type ClienteListRow } from "../../../src/components/features/ClientesTable";
import { CLIENTE_WRITE_ROLES } from "../../../src/lib/domain/clients/cliente";
import { useListQuery } from "../../../src/components/useListQuery";
import { useUiStore, type ClienteDuplicateWarning } from "../../../src/lib/ui-store";
import type { Role } from "../../../src/server/handlers/auth";
import { Button } from "../../../src/components/ui/Button";
import { Input } from "../../../src/components/ui/Input";
import { Modal } from "../../../src/components/ui/Modal";

const COPY = {
  activeFilter: "Filtrar por estado",
  denied: "Tu sesión no es válida. Iniciá sesión para ver los clientes.",
  error: "No se pudieron cargar los clientes. Reintentá.",
  loading: "Cargando clientes…",
  login: "Ir a iniciar sesión",
  newClient: "Nuevo cliente",
  next: "Siguiente",
  previous: "Anterior",
  retry: "Reintentar",
  searchLabel: "Buscar clientes",
  searchPlaceholder: "Nombre o documento…",
  title: "Clientes",
  warningTitle: "Cliente posiblemente duplicado"
} as const;

const WARNING_FIELD_LABEL: Record<ClienteDuplicateWarning, string> = {
  email: "correo electrónico",
  phone: "teléfono"
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toClienteRow(value: unknown): ClienteListRow | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.displayName !== "string") return null;
  if (typeof value.active !== "boolean" || typeof value.version !== "number") return null;
  return {
    active: value.active,
    displayName: value.displayName,
    document: typeof value.document === "string" ? value.document : undefined,
    email: typeof value.email === "string" ? value.email : undefined,
    id: value.id,
    phone: typeof value.phone === "string" ? value.phone : undefined,
    version: value.version
  };
}

interface ClientesPayload {
  readonly items: readonly ClienteListRow[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
}

function asClientesPayload(payload: unknown): ClientesPayload {
  if (!isRecord(payload) || !isRecord(payload.data)) throw new Error(COPY.error);
  const data = payload.data;
  const rawItems = Array.isArray(data.items) ? data.items : [];
  return {
    items: rawItems.map(toClienteRow).filter((row): row is ClienteListRow => row !== null),
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

function ClientesPageContent() {
  const setModalOpen = useUiStore((state) => state.setClienteModalOpen);
  const warning = useUiStore((state) => state.duplicateWarning);
  const setWarning = useUiStore((state) => state.setDuplicateWarning);
  const [canCreate, setCanCreate] = useState(false);

  const { denied, drafts, params, query, setDraft, setParams } = useListQuery<ClientesPayload>({
    apiPath: "/api/gestion/clientes",
    authError: COPY.denied,
    basePath: "/app/clientes",
    defaults: { active: "true" },
    key: "clientes",
    loadError: COPY.error,
    normalize: (committed) => ({
      ...committed,
      active: committed["active"] === "false" ? "false" : committed["active"] === "all" ? "all" : "true"
    }),
    params: ["active", "page", "q"],
    parse: asClientesPayload
  });
  const { data, error, isFetching, refetch } = query;
  const active = params["active"] ?? "true";

  useEffect(() => {
    let active = true;
    fetch("/api/gestion/auth/session", { cache: "no-store" })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (active && response.ok && isRecord(payload) && isSessionActor(payload.data)) {
          setCanCreate(CLIENTE_WRITE_ROLES.has(payload.data.role as Role));
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
    <section aria-labelledby="clientes-title" className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">Módulo</p>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight text-ink" id="clientes-title">
          {COPY.title}
        </h1>
        {canCreate ? (
          <Button onClick={() => setModalOpen(true)} type="button">
            {COPY.newClient}
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
          <ClientesTable
            canManage={canCreate}
            error={error ? COPY.error : null}
            isLoading={isFetching}
            items={data?.items ?? []}
            onRetry={() => void refetch()}
          />
          {data && data.totalItems > 0 ? (
            <nav aria-label="Paginación de clientes" className="flex items-center justify-between">
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

      <ClienteCreateModal />
      <Modal
        closeLabel="Entendido"
        onClose={() => setWarning(null)}
        open={warning !== null}
        role="alertdialog"
        title={COPY.warningTitle}
      >
        <p className="text-sm leading-6 text-ink-muted">
          Ya existe un cliente con el mismo {warning ? WARNING_FIELD_LABEL[warning] : "contacto"}. Revisá los datos
          antes de continuar.
        </p>
      </Modal>
    </section>
  );
}

export default function ClientesPage() {
  return (
    <Suspense fallback={<p>{COPY.loading}</p>}>
      <ClientesPageContent />
    </Suspense>
  );
}
