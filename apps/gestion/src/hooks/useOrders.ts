"use client";

// Canonical client path for the order list (slice-2). Owns its key
// factory, fetch, and zod parse; shares nothing with the other ordenes
// hooks beyond the `["ordenes"]` invalidation root (existing
// `useNotifyOrdenCreated` path, unchanged).
// Frozen wire source (read-only): `OrderListResponse` in
// `src/server/ordenes/orders-handler.ts` served as `{ ok: true, data }`.
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { z } from "zod";

export interface OrdenesListParams {
  readonly dir?: string;
  readonly estado?: string;
  readonly page?: number;
  readonly pageSize?: number;
  readonly sort?: string;
}

export function ordenesListKey(
  params: OrdenesListParams
): readonly ["ordenes", "list", OrdenesListParams] {
  return ["ordenes", "list", params];
}

const ORDENES_LIST_ERROR_KINDS = {
  NETWORK: "network",
  PARSE: "parse"
} as const;

export type OrdenesListErrorKind =
  (typeof ORDENES_LIST_ERROR_KINDS)[keyof typeof ORDENES_LIST_ERROR_KINDS];

export class OrdenesListError extends Error {
  readonly kind: OrdenesListErrorKind;

  public constructor(kind: OrdenesListErrorKind, message?: string) {
    super(message ?? kind);
    this.name = "OrdenesListError";
    this.kind = kind;
  }
}

const ordenesListItemSchema = z.object({
  boletaNumero: z.string().optional(),
  clienteId: z.string(),
  clienteNombre: z.string(),
  equipment: z.string(),
  estado: z.string(),
  estimatedDisplay: z.string(),
  id: z.string(),
  numero: z.string(),
  paymentStatus: z.enum(["pendiente", "parcial", "pagado"]),
  total: z.number(),
  version: z.number()
});

const ordenesListResponseSchema = z.object({
  canViewBoleta: z.boolean(),
  counts: z.record(z.string(), z.number()),
  items: z.array(ordenesListItemSchema),
  page: z.number(),
  pageSize: z.number(),
  totalItems: z.number()
});

export type OrdenesListData = z.infer<typeof ordenesListResponseSchema>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function buildListSearch(params: OrdenesListParams): string {
  const search = new URLSearchParams();
  if (params.estado !== undefined) search.set("estado", params.estado);
  if (params.page !== undefined) search.set("page", String(params.page));
  if (params.pageSize !== undefined) search.set("pageSize", String(params.pageSize));
  if (params.sort !== undefined) search.set("sort", params.sort);
  if (params.dir !== undefined) search.set("dir", params.dir);
  return search.toString();
}

async function fetchOrdenesList(params: OrdenesListParams): Promise<OrdenesListData> {
  const search = buildListSearch(params);
  const url = search === "" ? "/api/gestion/ordenes" : `/api/gestion/ordenes?${search}`;
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store" });
  } catch {
    throw new OrdenesListError(ORDENES_LIST_ERROR_KINDS.NETWORK);
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new OrdenesListError(ORDENES_LIST_ERROR_KINDS.NETWORK);
  const body = isRecord(payload) && "data" in payload ? payload.data : payload;
  const parsed = ordenesListResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new OrdenesListError(
      ORDENES_LIST_ERROR_KINDS.PARSE,
      parsed.error.issues.map((issue) => issue.path.join(".")).join(",")
    );
  }
  return parsed.data;
}

export function useOrders(
  params: OrdenesListParams
): UseQueryResult<OrdenesListData, OrdenesListError> {
  return useQuery<OrdenesListData, OrdenesListError>({
    queryFn: () => fetchOrdenesList(params),
    queryKey: ordenesListKey(params),
    staleTime: 30_000
  });
}
