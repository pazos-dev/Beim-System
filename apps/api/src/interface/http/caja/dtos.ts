import { z } from "zod";

/**
 * Caja slice DTOs (interface layer, Unidad 6).
 *
 * Edge validation only: strict objects (unknown keys → 422), YYYY-MM-DD
 * business dates and non-negative amounts (mirrors the domain guards in
 * `openCashSession`/`recordMovement`). Shapes mirror the legacy
 * `gestion/schemas.ts` cash block so the thin router forwards already-valid
 * payloads; value rules stay in the domain and surface as 422/409 through
 * the frozen envelope.
 */

const dateMessage = "Formato de fecha esperado: YYYY-MM-DD";
const uuidMessage = "Identificador inválido";

/** `POST /cash-sessions` → `open` (id is server-generated, never a client field). */
export const cashSessionOpenBodySchema = z
  .strictObject({
    businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, dateMessage),
    openingAmount: z.number().nonnegative("openingAmount no puede ser negativo"),
    notes: z.string().optional()
  })
  .strict();

/** `POST /cash-sessions/:id/close` → `close`. */
export const cashSessionCloseBodySchema = z
  .strictObject({
    countedAmount: z.number().nonnegative("countedAmount no puede ser negativo")
  })
  .strict();

/** `POST /cash-sessions/:id/movements` → `recordMovement`. */
export const cashSessionMovementBodySchema = z
  .strictObject({
    type: z.enum(["ingreso", "egreso", "ajuste"]),
    amount: z.number().positive("amount debe ser positivo"),
    notes: z.string().optional()
  })
  .strict();

/** Session path id (uuid, mirrors the legacy `paramIdSchema`). */
export const cashSessionIdParamSchema = z.strictObject({ id: z.uuid(uuidMessage) }).strict();

export type CashSessionOpenBody = z.infer<typeof cashSessionOpenBodySchema>;
export type CashSessionCloseBody = z.infer<typeof cashSessionCloseBodySchema>;
export type CashSessionMovementBody = z.infer<typeof cashSessionMovementBodySchema>;
