import { z } from "zod";

/**
 * Reports slice DTOs (interface layer, gap-slice G2).
 *
 * Edge validation only: strict objects (unknown keys → 422), YYYY-MM-DD
 * business dates, top-products limit 1..100. Shapes mirror the legacy
 * `gestion/schemas.ts` reports block so the thin router forwards
 * already-valid queries; range policy stays in the application/infra
 * handlers and surfaces as 422 through the frozen envelope.
 */

const dateMessage = "Formato de fecha esperado: YYYY-MM-DD";
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, dateMessage);

/** `GET /reports/sales-summary` and `GET /reports/cash-summary` queries. */
export const reportsRangeQuerySchema = z.strictObject({
  from: dateString.optional(),
  to: dateString.optional()
});

/** `GET /reports/top-products` query: same range plus a clamped limit. */
export const reportsTopQuerySchema = z.strictObject({
  from: dateString.optional(),
  to: dateString.optional(),
  limit: z.coerce.number().int().positive().max(100).optional()
});

export type ReportsRangeQuery = z.infer<typeof reportsRangeQuerySchema>;
export type ReportsTopQuery = z.infer<typeof reportsTopQuerySchema>;
