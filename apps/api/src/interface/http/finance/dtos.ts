import { z } from "zod";

/**
 * Finance edge DTOs (interface layer, gap-slice G3).
 *
 * Byte-identical mirror of the legacy gestion boundary (`schemas.ts`:
 * `financialStateSchema`, `invoiceSettingsSchema`, `stockMovementSchema`,
 * `stockMovementsQuerySchema`). Strict zod only: unknown keys 422. The
 * router passes the parsed DTO straight to the injected handler — no rules,
 * no pg, no adapters. Range/business validation (negative capital, opening
 * balances) stays in the application adapter at cutover and surfaces 422
 * through the frozen envelope, like legacy.
 */

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha esperado: YYYY-MM-DD");

export const financialStateBodySchema = z
  .strictObject({
    capitalInitial: z.number().optional(),
    expenses: z.array(z.unknown()).optional(),
    menuItems: z.array(z.unknown()).optional(),
    accountingState: z.record(z.string(), z.unknown()).optional(),
    preferences: z.record(z.string(), z.unknown()).optional()
  })
  .strict();

export const invoiceSettingsBodySchema = z
  .strictObject({
    business: z
      .strictObject({
        name: z.string().trim().min(1).optional(),
        address: z.string().trim().min(1).optional(),
        phone: z.string().trim().min(1).optional(),
        rut: z.string().trim().min(1).optional()
      })
      .strict()
      .optional(),
    policies: z.string().trim().min(1).optional(),
    warranty: z.string().trim().min(1).optional(),
    footer: z.string().trim().min(1).optional(),
    customSections: z
      .array(
        z
          .strictObject({
            id: z.string().trim().min(1),
            title: z.string().trim().min(1),
            body: z.string().trim().min(1)
          })
          .strict()
      )
      .optional()
  })
  .strict();

export const stockMovementBodySchema = z
  .strictObject({
    productId: z.string().trim().min(1, "productId requerido"),
    movementType: z.enum(["entrada", "salida"]),
    quantity: z.number().int().positive("quantity debe ser un entero positivo"),
    detail: z.string().optional()
  })
  .strict();

export const stockMovementsQuerySchema = z
  .strictObject({
    productId: z.string().trim().optional(),
    from: dateString.optional(),
    to: dateString.optional()
  })
  .strict();

export type FinancialStateBody = z.infer<typeof financialStateBodySchema>;
export type InvoiceSettingsBody = z.infer<typeof invoiceSettingsBodySchema>;
export type StockMovementBody = z.infer<typeof stockMovementBodySchema>;
export type StockMovementsQuery = z.infer<typeof stockMovementsQuerySchema>;
