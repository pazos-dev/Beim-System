"use client";

import { useEffect, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { OrderPrint, type OrderView } from "../../../src/components/features/OrderPrint";
import { OrdersStateFilterBar } from "../../../src/components/features/OrdersStateFilterBar";
import {
  OrdersTable,
  type OrderListRow
} from "../../../src/components/features/OrdersTable";
import { CreateOrderButton } from "../../../src/components/features/CreateOrderButton";
import { ORDER_CREATE_ROLES } from "../../../src/lib/domain/orders/order-roles";
import type { Role } from "../../../src/server/handlers/auth";
import { isOrderStateFilterKey, type OrderStateFilterKey } from "../../../src/lib/domain/orders/orden";
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

interface SessionActor {
  readonly role: string;
}

function isSessionActor(value: unknown): value is SessionActor {
  return isRecord(value) && typeof value.role === "string";
}

export default function OrdenesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<OrderListRow | null>(null);
  const [showPrint, setShowPrint] = useState(false);
  const [canCreate, setCanCreate] = useState(false);
  const [denied, setDenied] = useState(false);

  const rawFilter = searchParams.get("estado");
  const activeFilter: OrderStateFilterKey = isOrderStateFilterKey(rawFilter) ? rawFilter : DEFAULT_FILTER;
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const sortParam = searchParams.get("sort") ?? "numero";
  const sort: "numero" | "clienteNombre" | "estado" | "total" =
    sortParam === "clienteNombre" || sortParam === "estado" || sortParam === "total" ? sortParam : "numero";
  const dirParam = searchParams.get("dir");
  const dir: "asc" | "desc" = dirParam === "desc" ? "desc" : "asc";

  const { data, error, isFetching, refetch } = useQuery({
    enabled: !denied,
    queryFn: async () => {
      const params = new URLSearchParams({
        dir,
        estado: activeFilter,
        page: String(page),
        sort
      });
      const response = await fetch(`/api/gestion/ordenes?${params.toString()}`, { cache: "no-store" });
      if (response.status === 401 || response.status === 403) {
        setDenied(true);
        throw new Error(COPY.denied);
      }
      if (!response.ok) throw new Error(COPY.error);
      return asOrderListPayload(await response.json());
    },
    queryKey: ["ordenes", { dir, estado: activeFilter, page, sort }],
    staleTime: 30_000
  });

  useEffect(() => {
    let active = true;
    fetch("/api/gestion/auth/session", { cache: "no-store" })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (active && response.ok && isRecord(payload) && isSessionActor(payload.data)) {
          setCanCreate(ORDER_CREATE_ROLES.has(payload.data.role as Role));
        }
      })
      .catch(() => {
        // El botón Crear es solo un acceso; la defensa real es server-side.
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
    router.replace(`/app/ordenes?${params.toString()}`);
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