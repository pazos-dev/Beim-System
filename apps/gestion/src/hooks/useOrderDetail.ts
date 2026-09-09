"use client";

// Canonical client path for order detail (slice-2). Owns its key factory,
// fetch, and zod parse; shares nothing with the other ordenes hooks beyond
// the `["ordenes"]` invalidation root.
// Frozen wire source (read-only): `Orden` in `src/server/data/schemas.ts`
// served as `{ ok: true, data }`.
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { z } from "zod";

export function ordenesDetailKey(id: string): readonly ["ordenes", "detail", string] {
  return ["ordenes", "detail", id];
}

const ORDENES_DETAIL_ERROR_KINDS = {
  NETWORK: "network",
  PARSE: "parse"
} as const;

export type OrdenesDetailErrorKind =
  (typeof ORDENES_DETAIL_ERROR_KINDS)[keyof typeof ORDENES_DETAIL_ERROR_KINDS];

export class OrdenesDetailError extends Error {
  readonly kind: OrdenesDetailErrorKind;

  public constructor(kind: OrdenesDetailErrorKind, message?: string) {
    super(message ?? kind);
    this.name = "OrdenesDetailError";
    this.kind = kind;
  }
}

const ordenesDetailSchema = z.object({
  boletaNumero: z.string().optional(),
  clienteId: z.string(),
  deviceBrand: z.string().optional(),
  deviceColor: z.string().optional(),
  deviceModel: z.string().optional(),
  estado: z.string(),
  estimatedTime: z.number().optional(),
  estimatedTimeUnit: z.string().optional(),
  id: z.string(),
  numero: z.string(),
  ownerId: z.string(),
  paymentStatus: z.enum(["pendiente", "parcial", "pagado"]),
  total: z.number(),
  version: z.number()
});

export type OrdenesDetailData = z.infer<typeof ordenesDetailSchema>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function fetchOrdenDetail(id: string): Promise<OrdenesDetailData> {
  let response: Response;
  try {
    response = await fetch(`/api/gestion/ordenes/${id}`, { cache: "no-store" });
  } catch {
    throw new OrdenesDetailError(ORDENES_DETAIL_ERROR_KINDS.NETWORK);
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new OrdenesDetailError(ORDENES_DETAIL_ERROR_KINDS.NETWORK);
  const body = isRecord(payload) && "data" in payload ? payload.data : payload;
  const parsed = ordenesDetailSchema.safeParse(body);
  if (!parsed.success) {
    throw new OrdenesDetailError(
      ORDENES_DETAIL_ERROR_KINDS.PARSE,
      parsed.error.issues.map((issue) => issue.path.join(".")).join(",")
    );
  }
  return parsed.data;
}

export function useOrderDetail(id: string): UseQueryResult<OrdenesDetailData, OrdenesDetailError> {
  return useQuery<OrdenesDetailData, OrdenesDetailError>({
    enabled: id !== "",
    queryFn: () => fetchOrdenDetail(id),
    queryKey: ordenesDetailKey(id)
  });
}
