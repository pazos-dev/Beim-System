import { Router } from "express";
import { buildSuccessEnvelope } from "../../../errors/envelope.js";
import { NotFoundError } from "../../../errors/taxonomy.js";
import { asyncHandler } from "../../../middleware/error-handler.js";
import { validate } from "../edge/validate.js";
import { interfaceErrorHandler } from "../errorHandler.js";
import {
  ordersCancelParamSchema,
  ordersIdParamSchema,
  ordersListQuerySchema,
  type OrdersListQuery
} from "./dtos.js";

/**
 * Orders-read thin router (interface layer, gap-slice G4b).
 *
 * Validate (strict zod) → call exactly one injected handler → render the
 * frozen envelope. No business rules, no data access, no infrastructure
 * imports: every dependency is a handler function supplied by the composition
 * root (fakes in tests; the application orders-reads handlers at cutover).
 * Routes, envelopes and statuses mirror the legacy `webshop/router.ts`
 * orders-read block (`GET /orders` paginated over the caller's rows,
 * `GET /orders/:id` uuid with the legacy `Orden no encontrada: <id>` 404,
 * `POST /orders/:id/cancel` lax TEXT id with the legacy `{ order }`
 * envelope) — zero observable change.
 *
 * Auth lives in the cutover wiring (`requireWebshopToken` → uniform 401):
 * until then the router stays fail-closed on its own — a call without
 * `req.identity` sees 404 (`NOT_FOUND_OR_FORBIDDEN`, never a hint), exactly
 * like the `requireRole` policy. NOT mounted yet: cutover mounts it under
 * `/api/v1` and empties the legacy block, so `/openapi.json` stays
 * byte-identical in this slice.
 */

/** Handler surface the router calls; implemented by application handlers at cutover. */
export interface OrdersReadRouterDeps {
  listMine(userId: string, query: OrdersListQuery): Promise<unknown>;
  getMine(userId: string, orderId: string): Promise<unknown | null>;
  cancel(userId: string, orderId: string): Promise<{ order: unknown }>;
}

export function createOrdersReadRouter(deps: OrdersReadRouterDeps): Router {
  const router: Router = Router();

  router.get(
    "/orders",
    validate(ordersListQuerySchema, "query"),
    asyncHandler(async (req, res) => {
      const userId = req.identity?.userId;
      if (userId === undefined) throw new NotFoundError();
      res.json(buildSuccessEnvelope(await deps.listMine(userId, req.query as unknown as OrdersListQuery)));
    })
  );

  router.get(
    "/orders/:id",
    validate(ordersIdParamSchema, "params"),
    asyncHandler(async (req, res) => {
      const userId = req.identity?.userId;
      if (userId === undefined) throw new NotFoundError();
      const id = req.params.id as string;
      const order = await deps.getMine(userId, id);
      if (order === null) throw new NotFoundError(`Orden no encontrada: ${id}`);
      res.json(buildSuccessEnvelope(order));
    })
  );

  router.post(
    "/orders/:id/cancel",
    // Lax id on purpose (see ordersCancelParamSchema): orders.id is TEXT
    // and legacy rows are not uuid-shaped; the handler owns 404/409.
    validate(ordersCancelParamSchema, "params"),
    asyncHandler(async (req, res) => {
      const userId = req.identity?.userId;
      if (userId === undefined) throw new NotFoundError();
      const id = req.params.id as string;
      const cancelled = await deps.cancel(userId, id);
      res.json(buildSuccessEnvelope({ order: cancelled.order }));
    })
  );

  router.use(interfaceErrorHandler);
  return router;
}
