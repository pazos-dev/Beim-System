// Maps brief `controllers/orden-controller.ts` to the flat
// `src/server/ordenes/*` layout (slice-1 precedent). Thin boundary: zod
// validation on frozen schemas, `GestionError` to HTTP mapping, delegation
// to `OrdenUseCases`. No business rules, no role checks, no store access.
// Frozen sources (read-only, pinned): `orderListViewQuerySchema` from
// `orders-handler.ts`, `createOrderInputSchema` from
// `lib/domain/orders/orden.ts`, HTTP statuses from `shared/errors.ts`
// (identical to the frozen route behavior: list 200, detail 200,
// create 201).
import { z } from "zod";

import { createOrderInputSchema } from "../../lib/domain/orders/orden";
import type { GestionError, Orden } from "../data/schemas";
import { createGestionError, ERROR_CODES, getHttpStatus } from "../shared/errors";
import type { OrderActor } from "../shared/order-context";
import { orderListViewQuerySchema, type OrderListResponse } from "./orders-handler";
import type { OrdenUseCases } from "./orden-use-cases";

const ordenIdSchema = z.string().trim().min(1).max(100);

export type OrdenControllerBody<T> = { data: T; ok: true } | { error: GestionError; ok: false };

export interface OrdenControllerResponse<T> {
  body: OrdenControllerBody<T>;
  status: number;
}

function failure<T>(error: GestionError): OrdenControllerResponse<T> {
  return { body: { error, ok: false }, status: getHttpStatus(error.code) };
}

export class OrdenController {
  private readonly useCases: OrdenUseCases;

  public constructor(useCases: OrdenUseCases) {
    this.useCases = useCases;
  }

  public async list(
    actor: OrderActor,
    query: unknown
  ): Promise<OrdenControllerResponse<OrderListResponse>> {
    const parsed = orderListViewQuerySchema.safeParse(query);
    if (!parsed.success) {
      return failure(createGestionError(ERROR_CODES.VALIDATION_ERROR));
    }
    const listed = await this.useCases.list(actor, parsed.data);
    if (!listed.ok) return failure(listed.error);
    return { body: { data: listed.value, ok: true }, status: 200 };
  }

  public async getById(
    actor: OrderActor,
    id: unknown
  ): Promise<OrdenControllerResponse<Orden>> {
    const parsed = ordenIdSchema.safeParse(id);
    if (!parsed.success) {
      return failure(
        createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["id"] })
      );
    }
    const found = await this.useCases.getById(actor, parsed.data);
    if (!found.ok) return failure(found.error);
    return { body: { data: found.value, ok: true }, status: 200 };
  }

  public async create(
    actor: OrderActor,
    input: unknown
  ): Promise<OrdenControllerResponse<Orden>> {
    const parsed = createOrderInputSchema.safeParse(input);
    if (!parsed.success) {
      return failure(createGestionError(ERROR_CODES.VALIDATION_ERROR));
    }
    const created = await this.useCases.create(actor, parsed.data);
    if (!created.ok) return failure(created.error);
    return { body: { data: created.value, ok: true }, status: 201 };
  }
}
