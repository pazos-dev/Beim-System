"use client";

import { Suspense, useEffect, useState } from "react";

import { useListQuery } from "../../../src/components/useListQuery";
import { MENU_ADMIN_ROLES, type MenuRole } from "../../../src/lib/domain/admin/menu-result";
import { useUiSliceStore } from "../../../src/store/ui.slice";
import { periodToRange } from "../../../src/lib/period-range";
import { Button } from "../../../src/components/ui/Button";
import { Input } from "../../../src/components/ui/Input";

const PAGE_SIZE = 50;

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

interface AuditRow {
  readonly id: string;
  readonly actor: string;
  readonly action: string;
  readonly entity: string;
  readonly instant: string;
  readonly result: string;
}

interface AuditPayload {
  readonly items: readonly AuditRow[];
  readonly total: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toAuditRow(value: unknown): AuditRow | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.accion !== "string") return null;
  if (typeof value.entidad !== "string" || typeof value.instante !== "string") return null;
  return {
    action: value.accion,
    actor: typeof value.actorId === "string" ? value.actorId : "—",
    entity: value.entidad,
    id: value.id,
    instant: value.instante,
    result: typeof value.resultado === "string" ? value.resultado : "—"
  };
}

function asAuditPayload(payload: unknown): AuditPayload {
  if (!isRecord(payload) || !isRecord(payload.data)) throw new Error(COPY.error);
  const data = payload.data;
  const rawItems = Array.isArray(data.items) ? data.items : [];
  return {
    items: rawItems.map(toAuditRow).filter((row): row is AuditRow => row !== null),
    total: typeof data.total === "number" ? data.total : 0
  };
}

interface SessionActor {
  readonly role: string;
}

function isSessionActor(value: unknown): value is SessionActor {
  return isRecord(value) && typeof value.role === "string";
}

// Admin-only: la defensa real es server-side (requireMenuAdmin en la ruta);
// el gate del cliente solo oculta la vista, igual que las demás páginas.
const ADMIN_ROLES: ReadonlySet<string> = new Set<string>([...MENU_ADMIN_ROLES]);

function AuditPageContent() {
  const period = useUiSliceStore((state) => state.period);
  const range = periodToRange(period);
  const [accessDenied, setAccessDenied] = useState(false);

  const { denied: queryDenied, drafts, params, query, setDraft, setParams } = useListQuery<AuditPayload>({
    apiPath: "/api/gestion/audit",
    authError: COPY.denied,
    basePath: "/app/audit",
    defaults: { from: range.desde, to: range.hasta },
    key: "audit",
    loadError: COPY.error,
    params: ["actor", "action", "from", "to", "page"],
    parse: asAuditPayload
  });
  const { data, error, isFetching, refetch } = query;
  const denied = accessDenied || queryDenied;

  useEffect(() => {
    let active = true;
    fetch("/api/gestion/auth/session", { cache: "no-store" })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (active && response.ok && isRecord(payload) && isSessionActor(payload.data)) {
          if (!ADMIN_ROLES.has(payload.data.role as MenuRole)) setAccessDenied(true);
        }
      })
      .catch(() => {
        // El gate visible es solo acceso; la defensa real es server-side.
      });
    return () => {
      active = false;
    };
  }, []);

  function updateParams(next: Record<string, string>): void {
    setParams(next);
  }

  const page = Math.max(1, Number.parseInt(params["page"] ?? "1", 10) || 1);
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
                value={drafts["actor"] ?? ""}
              />
            </div>
            <div className="flex-1">
              <Input
                label={COPY.actionFilter}
                onChange={(event) => setDraft("action", event.target.value)}
                placeholder={COPY.actionPlaceholder}
                value={drafts["action"] ?? ""}
              />
            </div>
            <div className="flex-1">
              <Input
                label={COPY.fromLabel}
                onChange={(event) => setDraft("from", event.target.value)}
                type="date"
                value={drafts["from"] ?? ""}
              />
            </div>
            <div className="flex-1">
              <Input
                label={COPY.toLabel}
                onChange={(event) => setDraft("to", event.target.value)}
                type="date"
                value={drafts["to"] ?? ""}
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
