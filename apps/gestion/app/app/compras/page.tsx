"use client";

import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ComprasTable, type CompraListRow } from "../../../src/components/features/ComprasTable";
import {
  EMPTY_PURCHASE_ENTRY_VALUES,
  PurchaseEntryFields,
  validatePurchaseEntry,
  type PurchaseEntryFieldName,
  type PurchaseEntryValues,
} from "../../../src/components/features/PurchaseEntryFields";
import {
  STOCK_WRITE_ROLES,
  type StockRole,
} from "../../../src/lib/domain/inventory/stock-roles";
import type { PurchaseInput } from "../../../src/lib/domain/inventory/inventory";
import { Button } from "../../../src/components/ui/Button";
import { Input } from "../../../src/components/ui/Input";
import { useToast } from "../../../src/components/ui/Toast";
import { useActor } from "../../../src/lib/api/auth-store";
import {
  compraRepository,
  type Purchase,
  type PurchaseListQuery,
  type PurchaseListResponse,
} from "../../../src/lib/api/compra-repository";

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
  title: "Compras",
} as const;

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;
const STALE_TIME_MS = 30_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toCompraRow(purchase: Purchase): CompraListRow | null {
  if (typeof purchase.id !== "string" || typeof purchase.supplierName !== "string") return null;
  const data = isRecord(purchase.data) ? purchase.data : {};
  const cantidad = typeof data.cantidad === "number" ? data.cantidad : 0;
  const costoUnitario = typeof data.costoUnitario === "number" ? data.costoUnitario : 0;
  return {
    id: purchase.id,
    productoId: typeof data.productoId === "string" ? data.productoId : "",
    proveedor: purchase.supplierName,
    cantidad,
    costoUnitario,
    total: typeof data.total === "number" ? data.total : cantidad * costoUnitario,
    fecha: typeof data.fecha === "string" ? data.fecha : "",
    comprobante: typeof data.comprobante === "string" ? data.comprobante : undefined,
  };
}

interface ComprasPayload {
  readonly items: readonly CompraListRow[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
}

function asComprasPayload(response: PurchaseListResponse): ComprasPayload {
  return {
    items: response.items.map(toCompraRow).filter((row): row is CompraListRow => row !== null),
    page: response.page,
    pageSize: response.limit,
    totalItems: response.total,
  };
}

interface FilterParams {
  readonly page: number;
  readonly proveedor: string;
  readonly q: string;
  readonly productoId: string;
}

function normalizePage(value: string | null): number {
  return Math.max(1, Number.parseInt(value ?? "1", 10) || 1);
}

function readParams(searchParams: URLSearchParams): FilterParams {
  return {
    page: normalizePage(searchParams.get("page")),
    proveedor: searchParams.get("proveedor") ?? "",
    q: searchParams.get("q") ?? "",
    productoId: searchParams.get("productoId") ?? "",
  };
}

function buildHref(
  basePath: string,
  current: URLSearchParams,
  next: Record<string, string>
): string {
  const params = new URLSearchParams(current.toString());
  for (const [key, value] of Object.entries(next)) {
    if (value === "") params.delete(key);
    else params.set(key, value);
  }
  const query = params.toString();
  return query === "" ? basePath : `${basePath}?${query}`;
}

function useCompraFilters() {
  const router = useRouter();
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const searchString = searchParams.toString();
  const params = useMemo(() => readParams(searchParams), [searchString]);
  const [drafts, setDrafts] = useState<FilterParams>(params);

  useEffect(() => {
    setDrafts(params);
  }, [params]);

  useEffect(() => {
    const textChanged =
      drafts.proveedor !== params.proveedor ||
      drafts.q !== params.q ||
      drafts.productoId !== params.productoId;
    if (!textChanged) return undefined;

    const timer = setTimeout(() => {
      router.replace(
        buildHref("/app/compras", searchParams, {
          proveedor: drafts.proveedor,
          q: drafts.q,
          productoId: drafts.productoId,
          page: "",
        })
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [drafts, params, router, searchString]);

  const setParams = (next: Record<string, string>): void => {
    router.replace(buildHref("/app/compras", searchParams, next));
  };

  const setDraft = (name: keyof FilterParams, value: string): void => {
    setDrafts((current) => ({ ...current, [name]: value }));
  };

  return { drafts, params, setDraft, setParams };
}

function ComprasPageContent() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const actor = useActor();
  const role = actor?.role as StockRole | undefined;
  const canAdmin = role !== undefined && STOCK_WRITE_ROLES.has(role);
  const [denied, setDenied] = useState(false);

  const { drafts, params, setDraft, setParams } = useCompraFilters();

  const { data, error, isFetching, refetch } = useQuery<ComprasPayload, Error>({
    enabled: actor !== null && !denied,
    queryFn: async () => {
      const envelope = await compraRepository.list({
        limit: PAGE_SIZE,
        page: params.page,
        ...(params.proveedor !== "" ? { supplierName: params.proveedor } : {}),
        ...(params.productoId !== "" ? { productId: params.productoId } : {}),
        ...(params.q !== "" ? { q: params.q } : {}),
      });

      if (!envelope.ok) {
        if (
          envelope.error?.code === "AUTHENTICATION_REQUIRED" ||
          envelope.error?.code === "FORBIDDEN"
        ) {
          setDenied(true);
        }
        throw new Error(COPY.error);
      }
      if (envelope.data === undefined) {
        throw new Error(COPY.error);
      }
      return asComprasPayload(envelope.data);
    },
    queryKey: [
      "compras",
      { page: params.page, productoId: params.productoId, proveedor: params.proveedor, q: params.q },
    ],
    staleTime: STALE_TIME_MS,
  });

  const [values, setValues] = useState<PurchaseEntryValues>(EMPTY_PURCHASE_ENTRY_VALUES);
  const [formError, setFormError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async (input: PurchaseInput) => {
      const { productoId, cantidad, costoUnitario, proveedor, deposito, comprobante } = input;
      const total = cantidad * costoUnitario;
      const envelope = await compraRepository.create({
        supplierName: proveedor,
        data: {
          productoId,
          cantidad,
          costoUnitario,
          total,
          ...(deposito ? { deposito } : {}),
          ...(comprobante ? { comprobante } : {}),
        },
      });
      if (!envelope.ok) {
        throw new Error(envelope.error?.message ?? COPY.entryError);
      }
      return envelope.data;
    },
    onError: (err: Error) => {
      setServerError(err.message);
    },
    onSuccess: () => {
      setValues(EMPTY_PURCHASE_ENTRY_VALUES);
      setFormError(null);
      setServerError(null);
      toast.success(COPY.success);
      void queryClient.invalidateQueries({ queryKey: ["compras"] });
    },
  });

  function handleFieldChange(field: PurchaseEntryFieldName, value: string): void {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function handleEntrySubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setFormError(null);
    setServerError(null);
    const parsed = validatePurchaseEntry(values);
    if (!parsed.success) {
      setFormError(COPY.entryFormError);
      return;
    }
    createMutation.mutate(parsed.data);
  }

  function updateParams(next: Record<string, string>): void {
    setParams(next);
  }

  const totalPages = data
    ? Math.max(1, Math.ceil(data.totalItems / Math.max(1, data.pageSize)))
    : 1;

  if (actor === null || denied || !canAdmin) {
    return (
      <section aria-labelledby="compras-title" className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">Módulo</p>
        <h1 className="text-3xl font-semibold tracking-tight text-ink" id="compras-title">
          {COPY.title}
        </h1>
        <p role="alert">
          {COPY.denied} <a href="/login">{COPY.login}</a>
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="compras-title" className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">Módulo</p>
      <h1 className="text-3xl font-semibold tracking-tight text-ink" id="compras-title">
        {COPY.title}
      </h1>

      {canAdmin ? (
        <section aria-labelledby="compras-entry-title" className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold text-ink" id="compras-entry-title">
            {COPY.entryTitle}
          </h2>
          <form className="flex flex-col gap-4" onSubmit={(event) => void handleEntrySubmit(event)}>
            <PurchaseEntryFields
              formError={formError}
              onChange={handleFieldChange}
              pending={createMutation.isPending}
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
