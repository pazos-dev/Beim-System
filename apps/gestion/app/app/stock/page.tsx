"use client";

import { Suspense, useEffect, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { PurchaseEntryModal } from "../../../src/components/features/PurchaseEntryModal";
import { StockLevelsTable, type StockLevelRow } from "../../../src/components/features/StockLevelsTable";
import { StockMovementModal } from "../../../src/components/features/StockMovementModal";
import { StockTransferModal } from "../../../src/components/features/StockTransferModal";
import {
  STOCK_OUTFLOW_ROLES,
  STOCK_WRITE_ROLES,
  type StockRole
} from "../../../src/lib/domain/inventory/stock-roles";
import { useUiStore } from "../../../src/lib/ui-store";
import { Button } from "../../../src/components/ui/Button";
import { Input } from "../../../src/components/ui/Input";

const COPY = {
  denied: "Tu sesión no es válida. Iniciá sesión para ver el stock.",
  depositoFilter: "Filtrar por depósito",
  error: "No se pudo cargar el stock. Reintentá.",
  loading: "Cargando stock…",
  login: "Ir a iniciar sesión",
  move: "Registrar movimiento",
  next: "Siguiente",
  previous: "Anterior",
  productoFilter: "Filtrar por producto",
  productoPlaceholder: "ID del producto…",
  purchase: "Registrar compra",
  retry: "Reintentar",
  title: "Stock",
  transfer: "Transferir"
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toStockRow(value: unknown): StockLevelRow | null {
  if (!isRecord(value)) return null;
  if (typeof value.productoId !== "string" || typeof value.displayName !== "string") return null;
  if (typeof value.deposito !== "string") return null;
  if (typeof value.balance !== "number" || typeof value.minimum !== "number") return null;
  if (typeof value.lowStock !== "boolean") return null;
  return {
    balance: value.balance,
    deposito: value.deposito,
    displayName: value.displayName,
    lowStock: value.lowStock,
    minimum: value.minimum,
    productoId: value.productoId
  };
}

interface StockPayload {
  readonly items: readonly StockLevelRow[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
}

function asStockPayload(payload: unknown): StockPayload {
  if (!isRecord(payload) || !isRecord(payload.data)) throw new Error(COPY.error);
  const data = payload.data;
  const rawItems = Array.isArray(data.items) ? data.items : [];
  return {
    items: rawItems.map(toStockRow).filter((row): row is StockLevelRow => row !== null),
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

function StockPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setMovementOpen = useUiStore((state) => state.setStockMovementModalOpen);
  const setTransferOpen = useUiStore((state) => state.setStockTransferModalOpen);
  const setPurchaseOpen = useUiStore((state) => state.setPurchaseModalOpen);
  const [canMove, setCanMove] = useState(false);
  const [canAdmin, setCanAdmin] = useState(false);
  const [denied, setDenied] = useState(false);

  const productoIdParam = searchParams.get("productoId") ?? "";
  const rawDeposito = searchParams.get("deposito") ?? "";
  const deposito = rawDeposito === "principal" || rawDeposito === "taller" ? rawDeposito : "";
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const [draft, setDraft] = useState(productoIdParam);

  useEffect(() => {
    setDraft(productoIdParam);
  }, [productoIdParam]);

  useEffect(() => {
    if (draft === productoIdParam) return undefined;
    const timer = setTimeout(() => {
      updateParams({ page: "", productoId: draft });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const { data, error, isFetching, refetch } = useQuery({
    enabled: !denied,
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page) });
      if (productoIdParam !== "") params.set("productoId", productoIdParam);
      if (deposito !== "") params.set("deposito", deposito);
      const response = await fetch(`/api/gestion/stock?${params.toString()}`, { cache: "no-store" });
      if (response.status === 401 || response.status === 403) {
        setDenied(true);
        throw new Error(COPY.denied);
      }
      if (!response.ok) throw new Error(COPY.error);
      return asStockPayload(await response.json());
    },
    queryKey: ["stock", { deposito, page, productoId: productoIdParam }],
    staleTime: 30_000
  });

  useEffect(() => {
    let active = true;
    fetch("/api/gestion/auth/session", { cache: "no-store" })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (active && response.ok && isRecord(payload) && isSessionActor(payload.data)) {
          const role = payload.data.role as StockRole;
          setCanMove(STOCK_OUTFLOW_ROLES.has(role));
          setCanAdmin(STOCK_WRITE_ROLES.has(role));
        }
      })
      .catch(() => {
        // Buttons are access only; enforcement is server-side.
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
    const query = params.toString();
    router.replace(query === "" ? "/app/stock" : `/app/stock?${query}`);
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.totalItems / Math.max(1, data.pageSize))) : 1;

  return (
    <section aria-labelledby="stock-title" className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">Módulo</p>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight text-ink" id="stock-title">
          {COPY.title}
        </h1>
        <div className="flex items-center gap-2">
          {canMove ? (
            <Button onClick={() => setMovementOpen(true)} type="button" variant="secondary">
              {COPY.move}
            </Button>
          ) : null}
          {canAdmin ? (
            <>
              <Button onClick={() => setTransferOpen(true)} type="button" variant="secondary">
                {COPY.transfer}
              </Button>
              <Button onClick={() => setPurchaseOpen(true)} type="button">
                {COPY.purchase}
              </Button>
            </>
          ) : null}
        </div>
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
                label={COPY.productoFilter}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={COPY.productoPlaceholder}
                value={draft}
              />
            </div>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
              {COPY.depositoFilter}
              <select
                aria-label={COPY.depositoFilter}
                className="min-h-10 rounded-md border border-line bg-surface px-3 py-2 text-ink"
                onChange={(event) => updateParams({ deposito: event.target.value, page: "" })}
                value={deposito}
              >
                <option value="">Todos</option>
                <option value="principal">principal</option>
                <option value="taller">taller</option>
              </select>
            </label>
          </div>
          <StockLevelsTable
            error={error ? COPY.error : null}
            isLoading={isFetching}
            items={data?.items ?? []}
            onRetry={() => void refetch()}
          />
          {data && data.totalItems > 0 ? (
            <nav aria-label="Paginación de stock" className="flex items-center justify-between">
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

      <StockMovementModal />
      <StockTransferModal />
      <PurchaseEntryModal />
    </section>
  );
}

export default function StockPage() {
  return (
    <Suspense fallback={<p>{COPY.loading}</p>}>
      <StockPageContent />
    </Suspense>
  );
}
