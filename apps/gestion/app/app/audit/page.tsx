"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { MENU_ADMIN_ROLES } from "../../../src/lib/domain/admin/menu-result";
import { useUiStore } from "../../../src/lib/ui-store";
import { periodToRange } from "../../../src/lib/period-range";
import { Button } from "../../../src/components/ui/Button";
import { Input } from "../../../src/components/ui/Input";
import { useActor } from "../../../src/lib/api/auth-store";
import { auditRepository, type AuditListResponse } from "../../../src/lib/api/audit-repository";

const PAGE_SIZE = 50;
const DEBOUNCE_MS = 300;
const STALE_TIME_MS = 30_000;

const COPY = {
  actionFilter: "Filtrar por acción",
  actionPlaceholder: "Acción…",
  actorFilter: "Filtrar por actor",
  actorPlaceholder: "ID del actor…",
  denied: "Tu sesión no es válida o no tenés permiso para ver la auditoría.",
  empty: "No hay eventos para los filtros seleccionados.",
  error: "No se pudo cargar la auditoría. Reintentá.",
  fromLabel: "Desde",
  loading: "Cargando auditoría…",
  login: "Ir a iniciar sesión",
  next: "Siguiente",
  previous: "Anterior",
  retry: "Reintentar",
  title: "Auditoría",
  toLabel: "Hasta"
} as const;

// Admin-only: la defensa real es server-side; el gate del cliente solo oculta la vista.
const ADMIN_ROLES: ReadonlySet<string> = new Set<string>([...MENU_ADMIN_ROLES]);

interface FilterParams {
  readonly actor: string;
  readonly action: string;
  readonly from: string;
  readonly to: string;
  readonly page: number;
}

function normalizePage(value: string | null): number {
  return Math.max(1, Number.parseInt(value ?? "1", 10) || 1);
}

function readParams(searchParams: URLSearchParams, defaults: { from: string; to: string }): FilterParams {
  return {
    actor: searchParams.get("actor") ?? "",
    action: searchParams.get("action") ?? "",
    from: searchParams.get("from") ?? defaults.from,
    to: searchParams.get("to") ?? defaults.to,
    page: normalizePage(searchParams.get("page")),
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

function useAuditFilters(defaults: { from: string; to: string }) {
  const router = useRouter();
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const searchString = searchParams.toString();
  const params = useMemo(() => readParams(searchParams, defaults), [searchString, defaults.from, defaults.to]);
  const [drafts, setDrafts] = useState<FilterParams>(params);

  useEffect(() => {
    setDrafts(params);
  }, [params]);

  useEffect(() => {
    const changed = (
      ["actor", "action", "from", "to"] as const
    ).some((name) => drafts[name] !== params[name]);
    if (!changed) return undefined;
    const timer = setTimeout(() => {
      router.replace(
        buildHref("/app/audit", searchParams, {
          action: drafts.action,
          actor: drafts.actor,
          from: drafts.from,
          page: "",
          to: drafts.to,
        })
      );
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [drafts, params, router, searchString]);

  function setParams(next: Record<string, string>): void {
    router.replace(buildHref("/app/audit", searchParams, next));
  }

  function setDraft(name: keyof FilterParams, value: string): void {
    setDrafts((current) => ({ ...current, [name]: value }));
  }

  return { drafts, params, setDraft, setParams };
}

function AuditPageContent() {
  const period = useUiStore((state) => state.period);
  const range = periodToRange(period);
  const defaults = useMemo(() => ({ from: range.desde, to: range.hasta }), [range.desde, range.hasta]);
  const actor = useActor();
  const roleDenied = actor === null || !ADMIN_ROLES.has(actor.role);
  const [authDenied, setAuthDenied] = useState(false);
  const denied = roleDenied || authDenied;

  useEffect(() => {
    setAuthDenied(false);
  }, [actor]);

  const { drafts, params, setDraft, setParams } = useAuditFilters(defaults);

  const { data, error, isFetching, refetch } = useQuery<AuditListResponse, Error>({
    enabled: !denied,
    queryFn: async () => {
      const envelope = await auditRepository.list({
        action: params.action || undefined,
        actor: params.actor || undefined,
        from: params.from,
        limit: PAGE_SIZE,
        page: params.page,
        to: params.to,
      });
      if (!envelope.ok) {
        if (envelope.error?.code === "AUTHENTICATION_REQUIRED" || envelope.error?.code === "FORBIDDEN") {
          setAuthDenied(true);
        }
        throw new Error(COPY.error);
      }
      if (envelope.data === undefined) throw new Error(COPY.error);
      return envelope.data;
    },
    queryKey: [
      "audit",
      { action: params.action, actor: params.actor, from: params.from, page: params.page, to: params.to },
    ],
    staleTime: STALE_TIME_MS,
  });

  function updateParams(next: Record<string, string>): void {
    setParams(next);
  }

  const page = params.page;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <section aria-labelledby="audit-title" className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">Módulo</p>
      <h1 className="text-3xl font-semibold tracking-tight text-ink" id="audit-title">
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
                label={COPY.actorFilter}
                onChange={(event) => setDraft("actor", event.target.value)}
                placeholder={COPY.actorPlaceholder}
                value={drafts.actor}
              />
            </div>
            <div className="flex-1">
              <Input
                label={COPY.actionFilter}
                onChange={(event) => setDraft("action", event.target.value)}
                placeholder={COPY.actionPlaceholder}
                value={drafts.action}
              />
            </div>
            <div className="flex-1">
              <Input
                label={COPY.fromLabel}
                onChange={(event) => setDraft("from", event.target.value)}
                type="date"
                value={drafts.from}
              />
            </div>
            <div className="flex-1">
              <Input
                label={COPY.toLabel}
                onChange={(event) => setDraft("to", event.target.value)}
                type="date"
                value={drafts.to}
              />
            </div>
          </div>
          {isFetching && data === undefined ? (
            <p>{COPY.loading}</p>
          ) : error ? (
            <p role="alert">
              {COPY.error}{" "}
              <Button onClick={() => void refetch()} type="button" variant="secondary">
                {COPY.retry}
              </Button>
            </p>
          ) : data && data.items.length > 0 ? (
            <>
              <table className="w-full border-collapse rounded-xl border border-line bg-surface text-sm">
                <caption className="sr-only">Eventos de auditoría</caption>
                <thead>
                  <tr className="border-b border-line text-left text-ink-muted">
                    <th className="px-4 py-2 font-medium" scope="col">
                      Instante
                    </th>
                    <th className="px-4 py-2 font-medium" scope="col">
                      Actor
                    </th>
                    <th className="px-4 py-2 font-medium" scope="col">
                      Acción
                    </th>
                    <th className="px-4 py-2 font-medium" scope="col">
                      Entidad
                    </th>
                    <th className="px-4 py-2 font-medium" scope="col">
                      Resultado
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => (
                    <tr className="border-b border-line last:border-0" key={row.id}>
                      <td className="px-4 py-2 text-ink">{row.instant}</td>
                      <td className="px-4 py-2 text-ink">{row.actor}</td>
                      <td className="px-4 py-2 text-ink">{row.action}</td>
                      <td className="px-4 py-2 text-ink">{row.entity}</td>
                      <td className="px-4 py-2 text-ink">{row.result}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <nav aria-label="Paginación de auditoría" className="flex items-center justify-between">
                <Button
                  disabled={page <= 1}
                  onClick={() => updateParams({ page: String(page - 1) })}
                  type="button"
                  variant="secondary"
                >
                  {COPY.previous}
                </Button>
                <p className="text-sm text-ink-muted">
                  Página {page} de {totalPages}
                </p>
                <Button
                  disabled={page >= totalPages}
                  onClick={() => updateParams({ page: String(page + 1) })}
                  type="button"
                  variant="secondary"
                >
                  {COPY.next}
                </Button>
              </nav>
            </>
          ) : (
            <p>{COPY.empty}</p>
          )}
        </>
      )}
    </section>
  );
}

export default function AuditPage() {
  return (
    <Suspense fallback={<p>{COPY.loading}</p>}>
      <AuditPageContent />
    </Suspense>
  );
}
