import { z } from "zod";

/**
 * Orders-read slice DTOs (interface layer, gap-slice G4b).
 *
 * Edge validation only: strict objects (unknown keys → 422), page/limit as
 * coerced ints with the legacy bounds (page ≥ 1, limit 1..100, defaults
 * 1/20) like the legacy `webshop/schemas.ts` `pageQuerySchema`. The read
 * param (`GET /orders/:id`) is uuid like the legacy `paramUuidSchema`; the
 * cancel param (`POST /orders/:id/cancel`) stays lax TEXT (`min(1).max(120)`,
 * mirrors `paramOrderIdSchema`): `orders.id` is TEXT and legacy rows are not
 * uuid-shaped — ownership and existence are enforced by the handler with
 * 404, never by the shape.
 */

/** `GET /orders` query: same keys as the legacy webshop router. */
export const ordersListQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

/** `GET /orders/:id` params: uuid, exactly like legacy. */
export const ordersIdParamSchema = z.strictObject({ id: z.uuid("Identificador inválido") });

/** `POST /orders/:id/cancel` params: lax legacy TEXT order id. */
export const ordersCancelParamSchema = z.strictObject({
  id: z.string().min(1, "Identificador requerido").max(120)
});

export type OrdersListQuery = z.infer<typeof ordersListQuerySchema>;
