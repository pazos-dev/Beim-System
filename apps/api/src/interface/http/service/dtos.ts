import { z } from "zod";
import { CURRENCIES } from "../../../domain/shared/types.js";

/**
 * Service edge DTOs (interface layer, Unidad 3 catalog slice).
 *
 * Strict zod only: unknown keys 422. Service ids are uuid (domain
 * `ServiceId` plus the legacy `paramIdSchema` agree); create/update mirror
 * the handler inputs (`CreateServiceInput` / `UpdateServiceInput`).
 */
export const serviceIdParamSchema = z.strictObject({ id: z.uuid("Identificador inválido") }).strict();

const serviceDataSchema = z.record(z.string(), z.unknown());

export const serviceCreateBodySchema = z
  .strictObject({
    id: z.uuid("Identificador inválido"),
    name: z.string().trim().min(1, "name requerido"),
    priceAmount: z.number().nonnegative(),
    priceCurrency: z.enum(CURRENCIES),
    active: z.boolean().optional(),
    data: serviceDataSchema.optional()
  })
  .strict();

export const serviceRenameBodySchema = z
  .strictObject({ name: z.string().trim().min(1, "name requerido") })
  .strict();

export const serviceRepriceBodySchema = z.strictObject({ amount: z.number().nonnegative() }).strict();

export const serviceUpdateBodySchema = z
  .strictObject({
    name: z.string().trim().min(1, "name requerido").optional(),
    priceAmount: z.number().nonnegative().optional(),
    active: z.boolean().optional(),
    data: serviceDataSchema.optional()
  })
  .strict();

export type ServiceUpdateBody = z.infer<typeof serviceUpdateBodySchema>;
