"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";

import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { ComprasTable, type CompraListRow } from "../../../src/components/features/ComprasTable";
import {
  EMPTY_PURCHASE_ENTRY_VALUES,
  PurchaseEntryFields,
  validatePurchaseEntry,
  type PurchaseEntryFieldName,
  type PurchaseEntryValues
} from "../../../src/components/features/PurchaseEntryFields";
import { STOCK_WRITE_ROLES, type StockRole } from "../../../src/lib/domain/inventory/stock-roles";
import { Button } from "../../../src/components/ui/Button";
import { Input } from "../../../src/components/ui/Input";
import { useToast } from "../../../src/components/ui/Toast";

const COPY = {
  denied: "Tu sesión no es válida. Iniciá sesión para ver las compras.",
  entryError: "No se pudo registrar la compra. Reintentá.",
  entryFormError: "Revisá los datos de la compra.",
  entryTitle: "Nueva compra",
  error: "No se pudieron cargar las compras. Reintentá.",
  loading: "Cargando compras…",
  login: "Ir a iniciar sesión",
  next: "Siguiente",
  previous: "Anterior",
  productoFilter: "Filtrar por producto",
  productoPlaceholder: "ID del producto…",
  proveedorFilter: "Filtrar por proveedor",
  proveedorPlaceholder: "Nombre del proveedor…",
  qFilter: "Buscar en compras",
  qPlaceholder: "Proveedor, comprobante o producto…",
  retry: "Reintentar",
  submit: "Registrar compra",
  success: "Compra registrada correctamente.",
  title: "Compras"
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toCompraRow(value: unknown): CompraListRow | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.productoId !== "string") return null;
  if (typeof value.proveedor !== "string") return null;
  if (typeof value.cantidad !== "number" || typeof value.costoUnitario !== "number") return null;
  if (typeof value.total !== "number" || typeof value.fecha !== "string") return null;
  return {
    cantidad: value.cantidad,
    comprobante: typeof value.comprobante === "string" ? value.comprobante : undefined,
    costoUnitario: value.costoUnitario,
    fecha: value.fecha,
    id: value.id,
    productoId: value.productoId,
    proveedor: value.proveedor,
    total: value.total
  };
}

interface ComprasPayload {
  readonly items: readonly CompraListRow[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
}

function asComprasPayload(payload: unknown): ComprasPayload {
  if (!isRecord(payload) || !isRecord(payload.data)) throw new Error(COPY.error);
  const data = payload.data;
  const rawItems = Array.isArray(data.items) ? data.items : [];
  return {
    items: rawItems.map(toCompraRow).filter((row): row is CompraListRow => row !== null),
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

function ComprasPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [canAdmin, setCanAdmin] = useState(false);
  const [denied, setDenied] = useState(false);

  const proveedorParam = searchParams.get("proveedor") ?? "";
  const qParam = searchParams.get("q") ?? "";
  const productoIdParam = searchParams.get("productoId") ?? "";
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const [drafts, setDrafts] = useState({ productoId: productoIdParam, proveedor: proveedorParam, q: qParam });

  useEffect(() => {
    setDrafts({ productoId: productoIdParam, proveedor: proveedorParam, q: qParam });
  }, [productoIdParam, proveedorParam, qParam]);

  useEffect(() => {
    if (drafts.proveedor === proveedorParam && drafts.q === qParam && drafts.productoId === productoIdParam) {
      return undefined;
    }
    const timer = setTimeout(() => {
      updateParams({ page: "", productoId: drafts.productoId, proveedor: drafts.proveedor, q: drafts.q });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts]);

  const { data, error, isFetching, refetch } = useQuery({
    enabled: !denied,
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page) });
      if (proveedorParam !== "") params.set("proveedor", proveedorParam);
      if (qParam !== "") params.set("q", qParam);
      if (productoIdParam !== "") params.set("productoId", productoIdParam);
      const response = await fetch(`/api/gestion/compras?${params.toString()}`, { cache: "no-store" });
      if (response.status === 401 || response.status === 403) {
        setDenied(true);
        throw new Error(COPY.denied);
      }
      if (!response.ok) throw new Error(COPY.error);
      return asComprasPayload(await response.json());
    },
    queryKey: ["compras", { page, productoId: productoIdParam, proveedor: proveedorParam, q: qParam }],
    staleTime: 30_000
  });

  useEffect(() => {
    let active = true;
    fetch("/api/gestion/auth/session", { cache: "no-store" })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (active && response.ok && isRecord(payload) && isSessionActor(payload.data)) {
          const admin = STOCK_WRITE_ROLES.has(payload.data.role as StockRole);
          setCanAdmin(admin);
          if (!admin) setDenied(true);
        }
      })
      .catch(() => {
        // The entry form is access only; enforcement is server-side.
      });
    return () => {
      active = false;
    };
  }, []);

  const [values, setValues] = useState<PurchaseEntryValues>(EMPTY_PURCHASE_ENTRY_VALUES);
  const [formError, setFormError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function handleFieldChange(field: PurchaseEntryFieldName, value: string): void {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function handleEntrySubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsed = validatePurchaseEntry(values);
    if (!parsed.success) {
      setFormError(COPY.entryFormError);
      return;
    }
    setFormError(null);
    setServerError(null);
    setPending(true);
    try {
      const response = await fetch("/api/gestion/compras", {
        body: JSON.stringify(parsed.data),
        headers: {
          "content-type": "application/json",
          "x-idempotency-key": crypto.randomUUID()
        },
        method: "POST"
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !isRecord(payload) || payload.ok !== true) {
        setServerError(COPY.entryError);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["compras"] });
      setValues(EMPTY_PURCHASE_ENTRY_VALUES);
      toast.success(COPY.success);
    } catch {
      setServerError(COPY.entryError);
    } finally {
      setPending(false);
    }
  }

  function updateParams(next: Record<string, string>): void {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === "") params.delete(key);
      else params.set(key, value);
    }
    const query = params.toString();
    router.replace(query === "" ? "/app/compras" : `/app/compras?${query}`);
  }

  function setDraft(field: keyof typeof drafts, value: string): void {
    setDrafts((current) => ({ ...current, [field]: value }));
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.totalItems / Math.max(1, data.pageSize))) : 1;

  return (
    <section aria-labelledby="compras-title" className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">Módulo</p>
      <h1 className="text-3xl font-semibold tracking-tight text-ink" id="compras-title">
        {COPY.title}
      </h1>

      {denied ? (
        <p role="alert">
          {COPY.denied} <a href="/login">{COPY.login}</a>
        </p>
      ) : (
        <>
          {canAdmin ? (
            <section aria-labelledby="compras-entry-title" className="flex flex-col gap-4">
              <h2 className="text-xl font-semibold text-ink" id="compras-entry-title">
                {COPY.entryTitle}
              </h2>
              <form className="flex flex-col gap-4" onSubmit={(event) => void handleEntrySubmit(event)}>
                <PurchaseEntryFields
                  formError={formError}
                  onChange={handleFieldChange}
                  pending={pending}
                  serverError={serverError}
                  submitLabel={COPY.submit}
                  values={values}
                />
              </form>
            </section>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Input
                label={COPY.proveedorFilter}
                onChange={(event) => setDraft("proveedor", event.target.value)}
                placeholder={COPY.proveedorPlaceholder}
                value={drafts.proveedor}
              />
            </div>
            <div className="flex-1">
              <Input
                label={COPY.qFilter}
                onChange={(event) => setDraft("q", event.target.value)}
                placeholder={COPY.qPlaceholder}
                value={drafts.q}
              />
            </div>
            <div className="flex-1">
              <Input
                label={COPY.productoFilter}
                onChange={(event) => setDraft("productoId", event.target.value)}
                placeholder={COPY.productoPlaceholder}
                value={drafts.productoId}
              />
            </div>
          </div>
          <ComprasTable
            error={error ? COPY.error : null}
            isLoading={isFetching}
            items={data?.items ?? []}
            onRetry={() => void refetch()}
          />
          {data && data.totalItems > 0 ? (
            <nav aria-label="Paginación de compras" className="flex items-center justify-between">
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
    </section>
  );
}

export default function ComprasPage() {
  return (
    <Suspense fallback={<p>{COPY.loading}</p>}>
      <ComprasPageContent />
    </Suspense>
  );
}
