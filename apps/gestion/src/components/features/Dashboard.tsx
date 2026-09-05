"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { DataTable, type DataTableColumn } from "../ui/DataTable";
import { DashboardMetrics, type DashboardMetric } from "./DashboardMetrics";

interface FocusCard {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly href: string;
}

interface RecentOrder {
  readonly id: string;
  readonly number: string;
  readonly customer: string;
  readonly status: string;
}

interface LowStockItem {
  readonly id: string;
  readonly name: string;
  readonly stock: number;
  readonly minimum: number;
}

interface BootstrapCliente {
  readonly id: string;
  readonly displayName: string;
}

interface BootstrapProducto {
  readonly id: string;
  readonly displayName: string;
  readonly stock: number;
  readonly minimum: number;
}

interface BootstrapOrden {
  readonly id: string;
  readonly numero: string;
  readonly clienteId: string;
  readonly estado: string;
  readonly paymentStatus: string;
}

interface BootstrapSesionCaja {
  readonly fecha: string;
  readonly estado: string;
}

interface BootstrapGasto {
  readonly importe: number;
}

interface BootstrapCollections {
  readonly clientes: readonly BootstrapCliente[];
  readonly productos: readonly BootstrapProducto[];
  readonly ordenes: readonly BootstrapOrden[];
  readonly sesionesCaja: readonly BootstrapSesionCaja[];
  readonly gastos: readonly BootstrapGasto[];
}

interface DashboardData {
  readonly metrics: readonly DashboardMetric[];
  readonly focusCards: readonly FocusCard[];
  readonly recentOrders: readonly RecentOrder[];
  readonly lowStock: readonly LowStockItem[];
  readonly openCashDate: string | null;
  readonly isEmpty: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asArray(value: unknown): ReadonlyArray<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

function requireArray(candidate: Record<string, unknown>, key: string): ReadonlyArray<Record<string, unknown>> {
  if (!Array.isArray(candidate[key])) {
    throw new Error("La respuesta del dashboard está incompleta.");
  }
  return asArray(candidate[key]);
}

function asCollections(payload: unknown): BootstrapCollections {
  if (!isRecord(payload)) {
    throw new Error("La respuesta del dashboard no es válida.");
  }
  const candidate = isRecord(payload.data) ? payload.data : payload;
  const clientes = requireArray(candidate, "clientes").map((item) => ({ id: asString(item.id), displayName: asString(item.displayName) }));
  const productos = requireArray(candidate, "productos").map((item) => ({
    displayName: asString(item.displayName),
    id: asString(item.id),
    minimum: asNumber(item.minimum),
    stock: asNumber(item.stock)
  }));
  const ordenes = requireArray(candidate, "ordenes").map((item) => ({
    clienteId: asString(item.clienteId),
    estado: asString(item.estado),
    id: asString(item.id),
    numero: asString(item.numero),
    paymentStatus: asString(item.paymentStatus)
  }));
  const sesionesCaja = requireArray(candidate, "sesionesCaja").map((item) => ({ estado: asString(item.estado), fecha: asString(item.fecha) }));
  const gastos = requireArray(candidate, "gastos").map((item) => ({ importe: asNumber(item.importe) }));
  return { clientes, gastos, ordenes, productos, sesionesCaja };
}

function buildDashboard(collections: BootstrapCollections): DashboardData {
  const namesById = new Map(collections.clientes.map((cliente) => [cliente.id, cliente.displayName]));
  const lowStock: readonly LowStockItem[] = collections.productos
    .filter((producto) => producto.stock <= producto.minimum)
    .map((producto) => ({ id: producto.id, minimum: producto.minimum, name: producto.displayName, stock: producto.stock }));
  const pendingPayments = collections.ordenes.filter((orden) => orden.paymentStatus !== "pagado").length;
  const expensesTotal = collections.gastos.reduce((sum, gasto) => sum + gasto.importe, 0);
  const openCash = collections.sesionesCaja.find((sesion) => sesion.estado === "abierta") ?? null;
  return {
    focusCards: [
      { description: `${collections.ordenes.length} órdenes visibles para tu rol.`, href: "/app/ordenes", id: "ordenes", title: "Órdenes" },
      { description: `${pendingPayments} órdenes con cobro pendiente.`, href: "/app/ordenes", id: "pagos", title: "Pagos pendientes" },
      { description: `${lowStock.length} productos en nivel mínimo.`, href: "/app/stock", id: "stock", title: "Stock bajo" },
      { description: `${collections.clientes.length} clientes visibles para tu rol.`, href: "/app/clientes", id: "clientes", title: "Clientes" }
    ],
    isEmpty: collections.clientes.length === 0 && collections.productos.length === 0 && collections.ordenes.length === 0,
    lowStock,
    metrics: [
      { id: "orders", label: "Órdenes del día", value: collections.ordenes.length },
      { id: "pending-payments", label: "Pagos pendientes", value: pendingPayments },
      { id: "low-stock", label: "Stock bajo", value: lowStock.length },
      { id: "daily-expenses", label: "Gastos del día", value: expensesTotal }
    ],
    openCashDate: openCash?.fecha ?? null,
    recentOrders: [...collections.ordenes]
      .slice(-5)
      .reverse()
      .map((orden) => ({ customer: namesById.get(orden.clienteId) ?? orden.clienteId, id: orden.id, number: orden.numero, status: orden.estado }))
  };
}

const orderColumns: readonly DataTableColumn<RecentOrder>[] = [
  { accessor: "number", header: "Orden", key: "number" },
  { accessor: "customer", header: "Cliente", key: "customer" },
  { accessor: "status", header: "Estado", key: "status" }
];

const stockColumns: readonly DataTableColumn<LowStockItem>[] = [
  { accessor: "name", header: "Producto", key: "name" },
  { accessor: "stock", header: "Stock", key: "stock" },
  { accessor: "minimum", header: "Mínimo", key: "minimum" }
];

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);

    fetch("/api/gestion/bootstrap", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("No se pudo cargar el dashboard.");
        }
        return buildDashboard(asCollections(await response.json()));
      })
      .then((nextData) => {
        if (active) {
          setData(nextData);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setData(null);
          setError("No se pudo cargar el dashboard. Reintentá cuando la dependencia esté disponible.");
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [retryKey]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">Operación diaria</p>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Dashboard</h1>
        <p className="max-w-2xl text-ink-muted">Un resumen de las excepciones que requieren atención del equipo.</p>
      </header>

      <DashboardMetrics
        error={error}
        isLoading={isLoading}
        metrics={data?.metrics}
        onRetry={() => setRetryKey((current) => current + 1)}
      />

      {isLoading ? (
        <div className="grid gap-8 xl:grid-cols-2">
          <DataTable columns={orderColumns} data={[]} isLoading />
          <DataTable columns={stockColumns} data={[]} isLoading />
        </div>
      ) : error ? null : data ? (
        <>
          <p className="text-sm text-ink-muted" role="note">
            {data.openCashDate ? `Caja abierta del día ${data.openCashDate}.` : "Sin caja abierta hoy."}
          </p>
          {data.isEmpty ? (
            <p role="status">Todavía no hay movimientos para mostrar.</p>
          ) : (
            <>
              <section aria-labelledby="focus-title" className="flex flex-col gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-ink" id="focus-title">
                    Focos de atención
                  </h2>
                  <p className="text-sm text-ink-muted">Accesos a vistas filtradas por la consulta autorizada.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {data.focusCards.map((card) => (
                    <Link
                      className="rounded-xl border border-line bg-surface p-5 transition-colors hover:border-brand hover:bg-brand/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                      href={card.href}
                      key={card.id}
                    >
                      <h3 className="font-semibold text-ink">{card.title}</h3>
                      <p className="mt-2 text-sm text-ink-muted">{card.description}</p>
                    </Link>
                  ))}
                </div>
              </section>
              <div className="grid gap-8 xl:grid-cols-2">
                <section aria-labelledby="recent-orders-title" className="flex flex-col gap-4">
                  <h2 className="text-xl font-semibold text-ink" id="recent-orders-title">
                    Órdenes recientes
                  </h2>
                  <DataTable columns={orderColumns} data={data.recentOrders} getRowId={(row) => row.id} />
                </section>
                <section aria-labelledby="low-stock-title" className="flex flex-col gap-4">
                  <h2 className="text-xl font-semibold text-ink" id="low-stock-title">
                    Stock bajo
                  </h2>
                  <DataTable columns={stockColumns} data={data.lowStock} getRowId={(row) => row.id} />
                </section>
              </div>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
