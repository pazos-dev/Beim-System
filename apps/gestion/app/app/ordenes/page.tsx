"use client";

import { Suspense, useState } from "react";

import { OrderPrint, type OrderView } from "../../../src/components/features/OrderPrint";
import { OrdersStateFilterBar } from "../../../src/components/features/OrdersStateFilterBar";
import {
  OrdersTable,
  type OrderListRow
} from "../../../src/components/features/OrdersTable";
import { CreateOrderButton } from "../../../src/components/features/CreateOrderButton";
import { ORDER_CREATE_ROLES } from "../../../src/lib/domain/orders/order-roles";
import { useSessionRole } from "../../../src/hooks/useSession";
import { isOrderStateFilterKey, type OrderStateFilterKey } from "../../../src/lib/domain/orders/orden";
import { useListQuery } from "../../../src/components/useListQuery";
import { Button } from "../../../src/components/ui/Button";

const DEFAULT_FILTER: OrderStateFilterKey = "en_diagnostico";
const PAGE_SIZE = 25;

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
  if (typeof value.total !== "number" || typeof value.paymentStatus !== "string") return null;
  if (value.paymentStatus !== "pendiente" && value.paymentStatus !== "parcial" && value.paymentStatus !== "pagado") {
    return null;
  }
  return {
    boletaNumero: typeof value.boletaNumero === "string" ? value.boletaNumero : undefined,
    clienteId: value.clienteId,
    clienteNombre: value.clienteNombre,
    equipment: value.equipment,
    estado: value.estado as OrderListRow["estado"],
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

function asOrderListPayload(payload: unknown): OrderListPayload {
  if (!isRecord(payload)) throw new Error(COPY.error);
  const data = payload.data;
  if (!isRecord(data)) throw new Error(COPY.error);
  const rawItems = Array.isArray(data.items) ? data.items : [];
  return {
    canViewBoleta: data.canViewBoleta === true,
    counts: isRecord(data.counts) ? (data.counts as Record<string, number>) : {},
    items: rawItems.map(toOrderListRow).filter((row): row is OrderListRow => row !== null),
    page: typeof data.page === "number" ? data.page : 1,
    pageSize: typeof data.pageSize === "number" ? data.pageSize : PAGE_SIZE,
    totalItems: typeof data.totalItems === "number" ? data.totalItems : 0
  };
}

function OrdenesPageContent() {
  const [selected, setSelected] = useState<OrderListRow | null>(null);
  const [showPrint, setShowPrint] = useState(false);
  // Session reads go through the canonical hook: no page-level session
  // fetch. The button is access-only; enforcement stays server-side.
  const sessionRole = useSessionRole();
  const canCreate = sessionRole !== undefined && ORDER_CREATE_ROLES.has(sessionRole);

  const {
    denied,
    params,
    query: { data, error, isFetching, refetch },
    setParams
  } = useListQuery<OrderListPayload>({
    apiPath: "/api/gestion/ordenes",
    authError: COPY.denied,
    basePath: "/app/ordenes",
    buildRequest: (committed) =>
      new URLSearchParams({
        dir: committed["dir"] ?? "asc",
        estado: committed["estado"] ?? DEFAULT_FILTER,
        page: committed["page"] ?? "1",
        sort: committed["sort"] ?? "numero"
      }).toString(),
    defaults: { dir: "asc", estado: DEFAULT_FILTER, sort: "numero" },
    key: "ordenes",
    loadError: COPY.error,
    normalize: (committed) => ({
      ...committed,
      dir: committed["dir"] === "desc" ? "desc" : "asc",
      estado: isOrderStateFilterKey(committed["estado"]) ? committed["estado"] : DEFAULT_FILTER,
      sort:
        committed["sort"] === "clienteNombre" || committed["sort"] === "estado" || committed["sort"] === "total"
          ? committed["sort"]
          : "numero"
    }),
    params: ["estado", "page", "sort", "dir"],
    parse: asOrderListPayload
  });

  const activeFilter = params["estado"] as OrderStateFilterKey;
  const sort = params["sort"] as "numero" | "clienteNombre" | "estado" | "total";
  const dir = params["dir"] as "asc" | "desc";

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

  return (
    <section aria-labelledby="ordenes-title" className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">Módulo</p>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight text-ink" id="ordenes-title">
          Órdenes
        </h1>
        <CreateOrderButton visible={canCreate} />
      </div>

      {denied ? (
        <p role="alert">
          {COPY.denied} <a href="/login">{COPY.login}</a>
        </p>
      ) : (
        <>
          <OrdersStateFilterBar
            activeFilter={activeFilter}
            counts={counts}
            onChange={handleFilter}
          />
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
        </>
      )}

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
