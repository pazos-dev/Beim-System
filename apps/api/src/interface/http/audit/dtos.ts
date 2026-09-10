import { z } from "zod";

/**
 * Audit slice DTOs (interface layer, gap-slice G2b).
 *
 * Edge validation only: strict objects (unknown keys → 422), exact action
 * match, actor uuid, YYYY-MM-DD business dates, page/limit as coerced
 * positive ints (limit max 100). Shapes mirror the legacy
 * `gestion/schemas.ts` `auditLogsQuerySchema` block so the thin router
 * forwards an already-valid query; the page/limit clamp policy stays in the
 * application handler and surfaces through the frozen envelope.
 */

const dateMessage = "Formato de fecha esperado: YYYY-MM-DD";
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, dateMessage);

/** `GET /audit-logs` query: same keys as the legacy gestion router. */
export const auditLogsQuerySchema = z.strictObject({
  actor: z.uuid("Identificador inválido").optional(),
  action: z.string().trim().min(1).optional(),
  from: dateString.optional(),
  to: dateString.optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional()
});

export type AuditLogsQuery = z.infer<typeof auditLogsQuerySchema>;
