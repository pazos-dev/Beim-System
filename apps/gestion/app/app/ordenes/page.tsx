"use client";

import { useEffect, useState } from "react";

import { OrderPrint, type OrderView } from "../../../src/components/features/OrderPrint";

const COPY = {
  denied: "Tu sesión no es válida. Iniciá sesión para ver las órdenes.",
  empty: "No hay órdenes registradas.",
  error: "No se pudieron cargar las órdenes. Reintentá.",
  loading: "Cargando órdenes…",
  login: "Ir a iniciar sesión",
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

function asOrders(payload: unknown): OrderView[] {
  const data = isRecord(payload) && Array.isArray(payload.data) ? payload.data : null;
  if (!data) throw new Error(COPY.error);
  return data.map(toOrderView).filter((order): order is OrderView => order !== null);
}

export default function OrdenesPage() {
  const [orders, setOrders] = useState<readonly OrderView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPrint, setShowPrint] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);
    setDenied(false);
    fetch("/api/gestion/ordenes", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) {
          if (active) {
            setDenied(true);
            setIsLoading(false);
          }
          return;
        }
        if (!response.ok) throw new Error(COPY.error);
        const next = asOrders(await response.json());
        if (active) {
          setOrders(next);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError(COPY.error);
          setIsLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [retryKey]);

  const selected = orders.find((order) => order.id === selectedId) ?? null;

  function handlePrint(): void {
    setShowPrint(true);
    if (typeof window !== "undefined" && typeof window.print === "function") window.print();
  }

  return (
    <section aria-labelledby="ordenes-title" className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">Módulo</p>
      <h1 className="text-3xl font-semibold tracking-tight text-ink" id="ordenes-title">
        Órdenes
      </h1>
      {isLoading ? (
        <p role="status">{COPY.loading}</p>
      ) : denied ? (
        <p role="alert">
          {COPY.denied} <a href="/login">{COPY.login}</a>
        </p>
      ) : error ? (
        <div className="no-print flex flex-col gap-2">
          <p role="alert">{error}</p>
          <button onClick={() => setRetryKey((current) => current + 1)} type="button">
            {COPY.retry}
          </button>
        </div>
      ) : orders.length === 0 ? (
        <p role="status">{COPY.empty}</p>
      ) : (
        <div className="no-print flex flex-col gap-4">
          <ul aria-label="Lista de órdenes" className="flex flex-col gap-2">
            {orders.map((order) => (
              <li key={order.id}>
                <button
                  aria-current={order.id === selectedId}
                  onClick={() => {
                    setSelectedId(order.id);
                    setShowPrint(false);
                  }}
                  type="button"
                >
                  {order.numero}
                </button>
              </li>
            ))}
          </ul>
          {selected ? (
            <article aria-labelledby="order-detail-title" className="rounded-xl border border-line bg-surface p-5">
              <h2 className="text-xl font-semibold text-ink" id="order-detail-title">
                Detalle de la orden
              </h2>
              <p className="mt-2 text-sm text-ink-muted">
                {selected.numero} · {selected.clienteId} · {selected.estado} · {selected.total}
              </p>
              <button onClick={handlePrint} type="button">
                Imprimir
              </button>
            </article>
          ) : null}
        </div>
      )}
      {showPrint && selected ? <OrderPrint order={selected} /> : null}
    </section>
  );
}
