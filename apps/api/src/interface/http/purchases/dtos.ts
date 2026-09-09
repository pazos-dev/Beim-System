import { z } from "zod";

/**
 * Purchase edge DTOs (interface layer, G1b purchases slice, closes G1).
 *
 * Byte-identical mirror of the legacy gestion boundary (`schemas.ts`:
 * `catalogActiveQuerySchema`, `paramIdSchema`, `purchaseCreateSchema`,
 * `purchaseUpdateSchema`). Strict zod only: unknown keys 422. The router
 * passes the parsed DTO straight to the injected handler — no rules, no
 * pg, no adapters, no mappers. Like legacy, `GET /` filters by `active`
 * only (no search/paging on this route).
 */
export const purchasesListQuerySchema = z
  .strictObject({
    active: z
      .enum(["true", "false", "all"])
      .transform((value) => (value === "all" ? "all" : value === "true"))
      .optional()
  })
  .strict();

export const purchaseIdParamSchema = z.strictObject({ id: z.uuid("Identificador inválido") }).strict();

export const purchaseCreateBodySchema = z
  .strictObject({
    supplierName: z.string().trim().min(1, "supplierName requerido"),
    data: z.record(z.string(), z.unknown()).optional()
  })
  .strict();

export const purchaseUpdateBodySchema = z
  .strictObject({
    supplierName: z.string().trim().min(1, "supplierName requerido").optional(),
    data: z.record(z.string(), z.unknown()).optional(),
    active: z.boolean().optional()
  })
  .strict();

export type PurchasesListQuery = z.infer<typeof purchasesListQuerySchema>;
export type PurchaseCreateBody = z.infer<typeof purchaseCreateBodySchema>;
export type PurchaseUpdateBody = z.infer<typeof purchaseUpdateBodySchema>;
