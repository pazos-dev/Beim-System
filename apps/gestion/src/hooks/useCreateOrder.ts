"use client";

// Canonical client path for order creation (slice-2). Owns its endpoint,
// payload passthrough, response parse, and `["ordenes"]` invalidation on
// settle (list + active detail refetch); shares nothing with the other
// ordenes hooks. The iframe `ORDEN_CREADA` path (`useNotifyOrdenCreated`)
// stays untouched.
// Frozen wire source (read-only): `Orden` in `src/server/data/schemas.ts`
// served as `{ ok: true, data }`; failures as `{ ok: false, error }`.
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { z } from "zod";

const ORDENES_CREATE_ERROR_KINDS = {
  NETWORK: "network",
  PARSE: "parse",
  SERVER: "server"
} as const;

export type OrdenesCreateErrorKind =
  (typeof ORDENES_CREATE_ERROR_KINDS)[keyof typeof ORDENES_CREATE_ERROR_KINDS];

export class OrdenesCreateError extends Error {
  readonly code: string;
  readonly kind: OrdenesCreateErrorKind;

  public constructor(kind: OrdenesCreateErrorKind, code: string = kind, message?: string) {
    super(message ?? code);
    this.name = "OrdenesCreateError";
    this.kind = kind;
    this.code = code;
  }
}

const ordenesCreatedSchema = z.object({
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

export type OrdenesCreatedData = z.infer<typeof ordenesCreatedSchema>;

export type CreateOrderVariables = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readServerCode(payload: unknown): string {
  if (isRecord(payload) && isRecord(payload.error) && typeof payload.error.code === "string") {
    return payload.error.code;
  }
  return "unknown";
}

async function postOrder(input: CreateOrderVariables): Promise<OrdenesCreatedData> {
  let response: Response;
  try {
    response = await fetch("/api/gestion/ordenes", {
      body: JSON.stringify(input),
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
        "x-idempotency-key": crypto.randomUUID()
      },
      method: "POST"
    });
  } catch {
    throw new OrdenesCreateError(ORDENES_CREATE_ERROR_KINDS.NETWORK);
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !isRecord(payload) || payload.ok !== true) {
    throw new OrdenesCreateError(ORDENES_CREATE_ERROR_KINDS.SERVER, readServerCode(payload));
  }
  const parsed = ordenesCreatedSchema.safeParse(payload.data);
  if (!parsed.success) {
    throw new OrdenesCreateError(
      ORDENES_CREATE_ERROR_KINDS.PARSE,
      "parse",
      parsed.error.issues.map((issue) => issue.path.join(".")).join(",")
    );
  }
  return parsed.data;
}

export function useCreateOrder(): UseMutationResult<
  OrdenesCreatedData,
  OrdenesCreateError,
  CreateOrderVariables
> {
  const queryClient = useQueryClient();
  return useMutation<OrdenesCreatedData, OrdenesCreateError, CreateOrderVariables>({
    mutationFn: postOrder,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["ordenes"] });
    }
  });
}
