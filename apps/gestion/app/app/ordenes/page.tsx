"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { OrderPrint, type OrderView } from "../../../src/components/features/OrderPrint";
import { OrdersStateFilterBar } from "../../../src/components/features/OrdersStateFilterBar";
import { OrdersTable, type OrderListRow } from "../../../src/components/features/OrdersTable";
import { CreateOrderButton } from "../../../src/components/features/CreateOrderButton";
import { ORDER_CREATE_ROLES, type OrderRole } from "../../../src/lib/domain/orders/order-roles";
import {
  isOrderStateFilterKey,
  orderFilterCounts,
  type OrderStateFilterKey,
  type StateToken
} from "../../../src/lib/domain/orders/orden";
import { useActor } from "../../../src/lib/api/auth-store";
import { ventaRepository, type VentaListResponse } from "../../../src/lib/api/venta-repository";
import { Button } from "../../../src/components/ui/Button";

const DEFAULT_FILTER: OrderStateFilterKey = "en_diagnostico";
const PAGE_SIZE = 25;
const STALE_TIME_MS = 30_000;

const COPY = {
  denied: "Tu sesión no es válida. Iniciá sesión para ver las órdenes.",
  empty: "No hay órdenes para el filtro seleccionado.",
  error: "No se pudieron cargar las órdenes. Reintentá.",
  loading: "Cargando órdenes…",
  login: "Ir a iniciar sesión",
  next: "Siguiente",
  previous: "Anterior",
  retry: "Reintentar"
} as const;

const ORDER_VIEW_BOLETA_ROLES: ReadonlySet<string> = new Set(["administrador", "administrador_principal"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPaymentStatus(value: unknown): value is OrderListRow["paymentStatus"] {
  return value === "pendiente" || value === "parcial" || value === "pagado";
}

function toOrderView(value: unknown): OrderView | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.numero !== "string") return null;
  if (typeof value.clienteId !== "string" || typeof value.estado !== "string") return null;
  if (typeof value.paymentStatus !== "string" || typeof value.total !== "number") return null;
  return {
    clienteId: value.clienteId,
    estado: value.estado,
    id: value.id,
    numero: value.numero,
    paymentStatus: value.paymentStatus,
    total: value.total
  };
}

function toOrderListRow(value: unknown): OrderListRow | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.numero !== "string") return null;
  if (typeof value.clienteId !== "string" || typeof value.clienteNombre !== "string") return null;
  if (
    typeof value.equipment !== "string" ||
    typeof value.estado !== "string" ||
    typeof value.estimatedDisplay !== "string"
  ) {
    return null;
  }
  if (typeof value.total !== "number" || !isPaymentStatus(value.paymentStatus)) return null;
  return {
    boletaNumero: typeof value.boletaNumero === "string" ? value.boletaNumero : undefined,
    clienteId: value.clienteId,
    clienteNombre: value.clienteNombre,
    equipment: value.equipment,
    estado: value.estado as StateToken,
    estimatedDisplay: value.estimatedDisplay,
    id: value.id,
    numero: value.numero,
    paymentStatus: value.paymentStatus,
    total: value.total
  };
}

interface OrderListPayload {
  canViewBoleta: boolean;
  counts: Record<string, number>;
  items: OrderListRow[];
  page: number;
  pageSize: number;
  totalItems: number;
}

function asOrderListPayload(response: VentaListResponse, canViewBoleta: boolean): OrderListPayload {
  const rawItems = response.items;
  return {
    canViewBoleta,
    counts: orderFilterCounts(rawItems.map((item) => ({ estado: item.estado as StateToken }))),
    items: rawItems.map(toOrderListRow).filter((row): row is OrderListRow => row !== null),
    page: response.page,
    pageSize: response.limit,
    totalItems: response.total
  };
}

interface FilterParams {
  readonly dir: "asc" | "desc";
  readonly estado: OrderStateFilterKey;
  readonly page: number;
  readonly sort: "numero" | "clienteNombre" | "estado" | "total";
}

function normalizeDir(value: string | null): FilterParams["dir"] {
  return value === "desc" ? "desc" : "asc";
}

function normalizeEstado(value: string | null): OrderStateFilterKey {
  return isOrderStateFilterKey(value) ? value : DEFAULT_FILTER;
}

function normalizePage(value: string | null): number {
  return Math.max(1, Number.parseInt(value ?? "1", 10) || 1);
}

function normalizeSort(value: string | null): FilterParams["sort"] {
  if (value === "clienteNombre" || value === "estado" || value === "total") return value;
  return "numero";
}

function readParams(searchParams: URLSearchParams): FilterParams {
  return {
    dir: normalizeDir(searchParams.get("dir")),
    estado: normalizeEstado(searchParams.get("estado")),
    page: normalizePage(searchParams.get("page")),
    sort: normalizeSort(searchParams.get("sort"))
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

function useOrdenesFilters() {
  const router = useRouter();
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const searchString = searchParams.toString();
  const params = useMemo(() => readParams(searchParams), [searchString]);

  const setParams = (next: Record<string, string>): void => {
    router.replace(buildHref("/app/ordenes", searchParams, next));
  };

  return { params, setParams };
}

function OrdenesPageContent() {
  const [selected, setSelected] = useState<OrderListRow | null>(null);
  const [showPrint, setShowPrint] = useState(false);
  const actor = useActor();
  const canCreate = actor !== null && ORDER_CREATE_ROLES.has(actor.role as OrderRole);
  const canViewBoleta = actor !== null && ORDER_VIEW_BOLETA_ROLES.has(actor.role);
  const [denied, setDenied] = useState(actor === null);

  useEffect(() => {
    setDenied(actor === null);
  }, [actor]);

  const { params, setParams } = useOrdenesFilters();

  const { data, error, isFetching, refetch } = useQuery<OrderListPayload, Error>({
    enabled: !denied,
    queryFn: async () => {
      const envelope = await ventaRepository.list({
        limit: PAGE_SIZE,
        page: params.page,
        status: params.estado === "todas" ? undefined : params.estado,
        type: "order"
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

      return asOrderListPayload(envelope.data, canViewBoleta);
    },
    queryKey: ["ordenes", { page: params.page, status: params.estado, type: "order" }],
    staleTime: STALE_TIME_MS
  });

  const activeFilter = params.estado;
  const sort = params.sort;
  const dir = params.dir;

  function updateParams(next: Record<string, string>): void {
    setParams(next);
  }

  function handleFilter(next: OrderStateFilterKey): void {
    updateParams({ dir: "", estado: next, page: "", sort: "" });
  }

  function handlePrint(): void {
    setShowPrint(true);
    if (typeof window !== "undefined" && typeof window.print === "function") window.print();
  }

  const counts: Record<OrderStateFilterKey, number> = {
    abiertas: 0,
    aprobado: 0,
    canceladas: 0,
    en_diagnostico: 0,
    en_proceso: 0,
    espera_repuesto: 0,
    finalizadas: 0,
    presupuesto: 0,
    todas: 0,
    ...data?.counts
  };
  const totalPages = data ? Math.max(1, Math.ceil(data.totalItems / Math.max(1, data.pageSize))) : 1;

  if (denied) {
    return (
      <section aria-labelledby="ordenes-title" className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">Módulo</p>
        <h1 className="text-3xl font-semibold tracking-tight text-ink" id="ordenes-title">
          Órdenes
        </h1>
        <p role="alert">
          {COPY.denied} <a href="/login">{COPY.login}</a>
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="ordenes-title" className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">Módulo</p>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight text-ink" id="ordenes-title">
          Órdenes
        </h1>
        <CreateOrderButton visible={canCreate} />
      </div>

      <OrdersStateFilterBar activeFilter={activeFilter} counts={counts} onChange={handleFilter} />
      <OrdersTable
        canViewBoleta={data?.canViewBoleta ?? false}
        error={error ? COPY.error : null}
        items={data?.items ?? []}
        isLoading={isFetching}
        onRetry={() => void refetch()}
        onRowClick={(row) => {
          setSelected(row);
          setShowPrint(false);
        }}
        onSort={(columnKey) =>
          updateParams({
            dir: sort === columnKey && dir === "asc" ? "desc" : "asc",
            sort: columnKey,
            page: ""
          })
        }
        sortColumn={sort}
        sortDirection={dir}
      />
      {data && data.totalItems > 0 ? (
        <nav aria-label="Paginación de órdenes" className="flex items-center justify-between">
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

      {selected ? (
        <article aria-labelledby="order-detail-title" className="rounded-xl border border-line bg-surface p-5">
          <h2 className="text-xl font-semibold text-ink" id="order-detail-title">
            Detalle de la orden
          </h2>
          <p className="mt-2 text-sm text-ink-muted">
            {selected.numero} · {selected.clienteId} · {selected.estado} · {selected.total}
          </p>
          <Button onClick={handlePrint} type="button" variant="secondary">
            Imprimir
          </Button>
        </article>
      ) : null}
      {showPrint && selected
        ? (() => {
            const view: OrderView | null = toOrderView(selected);
            return view ? <OrderPrint order={view} /> : null;
          })()
        : null}
    </section>
  );
}

export default function OrdenesPage() {
  return (
    <Suspense fallback={<p>{COPY.loading}</p>}>
      <OrdenesPageContent />
    </Suspense>
  );
}
