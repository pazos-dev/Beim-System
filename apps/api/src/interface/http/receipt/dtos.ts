import { z } from "zod";

/**
 * Receipt/Ticket slice DTOs (interface layer, Unidad 5 receipt slice).
 *
 * Edge validation only: strict objects (unknown keys → 422), uuid ids,
 * closed repair-status enum, YYYY-MM-DD range bounds. Shapes mirror the
 * legacy `gestion/schemas.ts` receipt schemas field-for-field (same names,
 * same messages, same optional/required split — no shared-skin defaults, so
 * the handler receives exactly what the legacy service received). Value
 * rules stay in the domain; both layers surface failures as 422 through
 * the frozen envelope.
 */

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha esperado: YYYY-MM-DD");
const uuidMessage = "Identificador inválido";

export const receiptIdParamSchema = z.strictObject({ id: z.string().uuid(uuidMessage) });

export const receiptCreateBodySchema = z.strictObject({
  clientName: z.string().trim().min(1, "clientName requerido"),
  clientId: z.string().trim().optional(),
  clientPhone: z.string().trim().optional(),
  deviceBrand: z.string().trim().optional(),
  deviceModel: z.string().trim().optional(),
  deviceColor: z.string().trim().optional(),
  imeiSerial: z.string().trim().optional(),
  reportedIssue: z.string().trim().optional(),
  services: z.array(z.string().trim().min(1)).optional(),
  price: z.string().optional(),
  repairStatus: z.string().trim().optional(),
  quoteStatus: z.string().trim().optional(),
  quoteTotal: z.number().nonnegative().optional(),
  paymentStatus: z.string().trim().optional(),
  payload: z.record(z.string(), z.unknown()).optional()
});

/** Closed repair-status enum — mirrors REPAIR_STATUSES at the boundary. */
export const repairStatusBodySchema = z.strictObject({
  status: z.enum(["Ingresado", "En reparación", "Listo", "Entregado", "Cancelado"])
});

export const receiptsListQuerySchema = z.strictObject({
  client: z.string().trim().optional(),
  paymentMethod: z.string().trim().optional(),
  from: dateString.optional(),
  to: dateString.optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional()
});

export type ReceiptCreateBody = z.infer<typeof receiptCreateBodySchema>;
export type ReceiptsListQuery = z.infer<typeof receiptsListQuerySchema>;
export type RepairStatusBody = z.infer<typeof repairStatusBodySchema>;
