"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { ClienteCreateModal } from "../../../src/components/features/ClienteCreateModal";
import { ClientesTable, type ClienteListRow } from "../../../src/components/features/ClientesTable";
import { CLIENTE_WRITE_ROLES } from "../../../src/lib/domain/clients/cliente";
import { useUiStore, type ClienteDuplicateWarning } from "../../../src/lib/ui-store";
import { Button } from "../../../src/components/ui/Button";
import { Input } from "../../../src/components/ui/Input";
import { Modal } from "../../../src/components/ui/Modal";
import { clienteRepository, type Cliente, type ClienteListResponse } from "../../../src/lib/api/cliente-repository";
import { useActor } from "../../../src/lib/api/auth-store";

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

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;
const STALE_TIME_MS = 30_000;

interface ClientesPayload {
  readonly items: readonly ClienteListRow[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
}

function toClienteRow(cliente: Cliente): ClienteListRow {
  return {
    active: cliente.active,
    displayName: cliente.name,
    document: undefined,
    email: cliente.email,
    id: cliente.id,
    phone: cliente.phone,
    version: 1,
  };
}

function asClientesPayload(response: ClienteListResponse): ClientesPayload {
  return {
    items: response.items.map(toClienteRow),
    page: response.page,
    pageSize: response.limit,
    totalItems: response.total,
  };
}

interface FilterParams {
  readonly active: "true" | "false" | "all";
  readonly page: number;
  readonly q: string;
}

function normalizeActive(value: string | null): FilterParams["active"] {
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
    q: searchParams.get("q") ?? "",
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

function useClienteFilters() {
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
      router.replace(buildHref("/app/clientes", searchParams, { q: drafts.q, page: "" }));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [drafts.q, params.q, router, searchString]);

  const setParams = (next: Record<string, string>): void => {
    router.replace(buildHref("/app/clientes", searchParams, next));
  };

  const setDraft = (name: keyof FilterParams, value: string): void => {
    setDrafts((current) => ({ ...current, [name]: value }));
  };

  return { drafts, params, setDraft, setParams };
}

function ClientesPageContent() {
  const setModalOpen = useUiStore((state) => state.setClienteModalOpen);
  const warning = useUiStore((state) => state.duplicateWarning);
  const setWarning = useUiStore((state) => state.setDuplicateWarning);
  const actor = useActor();
  const canCreate = actor !== null && CLIENTE_WRITE_ROLES.has(actor.role);

  const { drafts, params, setDraft, setParams } = useClienteFilters();
  const [denied, setDenied] = useState(false);

  const activeParam = params.active === "all" ? undefined : params.active;

  const { data, error, isFetching, refetch } = useQuery<ClientesPayload, Error>({
    enabled: !denied,
    queryFn: async () => {
      const envelope = await clienteRepository.list({
        active: activeParam,
        limit: PAGE_SIZE,
        page: params.page,
        search: params.q,
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

      return asClientesPayload(envelope.data);
    },
    queryKey: ["clientes", { active: activeParam, page: params.page, search: params.q }],
    staleTime: STALE_TIME_MS,
  });

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
