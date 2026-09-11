"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { PurchaseEntryModal } from "../../../src/components/features/PurchaseEntryModal";
import { StockMovementModal } from "../../../src/components/features/StockMovementModal";
import { StockTransferModal } from "../../../src/components/features/StockTransferModal";
import { Button } from "../../../src/components/ui/Button";
import { DataTable, type DataTableColumn } from "../../../src/components/ui/DataTable";
import { Input } from "../../../src/components/ui/Input";
import { useActor } from "../../../src/lib/api/auth-store";
import {
  stockRepository,
  type StockMovement,
} from "../../../src/lib/api/stock-repository";
import {
  STOCK_OUTFLOW_ROLES,
  STOCK_WRITE_ROLES,
  type StockRole,
} from "../../../src/lib/domain/inventory/stock-roles";
import { useUiStore } from "../../../src/lib/ui-store";

const COPY = {
  cantidadHeader: "Cantidad",
  createdAtHeader: "Fecha",
  denied: "Tu sesión no es válida. Iniciá sesión para ver el stock.",
  detailHeader: "Detalle",
  empty: "No hay movimientos para mostrar.",
  endDateFilter: "Hasta",
  error: "No se pudo cargar el stock. Reintentá.",
  loading: "Cargando stock…",
  login: "Ir a iniciar sesión",
  move: "Registrar movimiento",
  movementTypeHeader: "Tipo",
  productIdHeader: "Producto",
  productoFilter: "Filtrar por producto",
  productoPlaceholder: "ID del producto…",
  purchase: "Registrar compra",
  retry: "Reintentar",
  startDateFilter: "Desde",
  title: "Stock",
  transfer: "Transferir",
} as const;

const FILTER_NAMES = ["productoId", "desde", "hasta"] as const;
type FilterName = (typeof FILTER_NAMES)[number];

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-AR");
  } catch {
    return iso;
  }
}

function movementTypeLabel(movementType: StockMovement["movementType"]): string {
  return movementType === "entrada" ? "Entrada" : "Salida";
}

const columns: readonly DataTableColumn<StockMovement>[] = [
  { accessor: "productId", header: COPY.productIdHeader, key: "productId" },
  {
    accessor: "movementType",
    header: COPY.movementTypeHeader,
    key: "movementType",
    render: (row) => movementTypeLabel(row.movementType),
  },
  { accessor: "quantity", header: COPY.cantidadHeader, key: "quantity" },
  { accessor: "detail", header: COPY.detailHeader, key: "detail" },
  {
    accessor: "createdAt",
    header: COPY.createdAtHeader,
    key: "createdAt",
    render: (row) => formatDate(row.createdAt),
  },
];

function useStockFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const committed = useMemo<Record<FilterName, string>>(
    () => ({
      desde: searchParams.get("desde") ?? "",
      hasta: searchParams.get("hasta") ?? "",
      productoId: searchParams.get("productoId") ?? "",
    }),
    [searchParams]
  );

  const [drafts, setDrafts] = useState<Record<FilterName, string>>(committed);

  useEffect(() => {
    setDrafts(committed);
  }, [committed]);

  useEffect(() => {
    const changed = FILTER_NAMES.some((name) => drafts[name] !== committed[name]);
    if (!changed) return undefined;

    const timer = setTimeout(() => {
      const next = new URLSearchParams(searchParams.toString());
      for (const name of FILTER_NAMES) {
        const value = drafts[name];
        if (value === "") next.delete(name);
        else next.set(name, value);
      }
      router.replace(`/app/stock?${next.toString()}`);
    }, 300);

    return () => clearTimeout(timer);
  }, [committed, drafts, router, searchParams]);

  function setDraft(name: FilterName, value: string): void {
    setDrafts((current) => ({ ...current, [name]: value }));
  }

  return { committed, drafts, setDraft };
}

function StockPageContent() {
  const actor = useActor();
  const role = actor?.role as StockRole | undefined;
  const canMove = role !== undefined && STOCK_OUTFLOW_ROLES.has(role);
  const canAdmin = role !== undefined && STOCK_WRITE_ROLES.has(role);

  const setMovementOpen = useUiStore((state) => state.setStockMovementModalOpen);
  const setTransferOpen = useUiStore((state) => state.setStockTransferModalOpen);
  const setPurchaseOpen = useUiStore((state) => state.setPurchaseModalOpen);

  const { committed, drafts, setDraft } = useStockFilters();

  const filters = useMemo(
    () => ({
      from: committed.desde || undefined,
      productId: committed.productoId || undefined,
      to: committed.hasta || undefined,
    }),
    [committed]
  );

  const { data, error, isFetching, refetch } = useQuery({
    queryFn: async () => {
      const envelope = await stockRepository.list(filters);
      if (!envelope.ok) {
        throw new Error(envelope.error?.message ?? envelope.error?.code ?? COPY.error);
      }
      return envelope.data;
    },
    queryKey: ["stock", filters],
  });

  if (actor === null) {
    return (
      <p role="alert">
        {COPY.denied} <a href="/login">{COPY.login}</a>
      </p>
    );
  }

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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Input
            label={COPY.productoFilter}
            onChange={(event) => setDraft("productoId", event.target.value)}
            placeholder={COPY.productoPlaceholder}
            value={drafts.productoId}
          />
        </div>
        <Input
          label={COPY.startDateFilter}
          onChange={(event) => setDraft("desde", event.target.value)}
          type="date"
          value={drafts.desde}
        />
        <Input
          label={COPY.endDateFilter}
          onChange={(event) => setDraft("hasta", event.target.value)}
          type="date"
          value={drafts.hasta}
        />
      </div>

      <DataTable
        caption="Movimientos de stock"
        columns={columns}
        data={data?.items ?? []}
        emptyMessage={COPY.empty}
        error={error ? COPY.error : null}
        getRowId={(row) => row.id}
        isLoading={isFetching}
        onRetry={() => void refetch()}
        visibleRowLimit={data?.items?.length ?? 0}
      />

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
