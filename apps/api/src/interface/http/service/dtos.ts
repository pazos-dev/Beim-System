import { z } from "zod";

/**
 * Service edge DTOs (interface layer, Unidad 3 catalog slice + G5 reads).
 *
 * Strict zod only: unknown keys 422. Service ids are uuid (domain
 * `ServiceId` plus the legacy `paramIdSchema` agree). The legacy-equivalent
 * routes (`POST /`, `PUT /:id`) mirror the legacy gestion schemas
 * (`serviceCreateSchema`/`serviceUpdateSchema`: server-owned identity and
 * data — no application pricing fields); the domain-only routes (rename,
 * reprice) keep their application vocabulary and stay unmounted at cutover.
 * The list query mirrors the legacy `catalogActiveQuerySchema` (`active`
 * only, no search/paging on this route) exactly like the purchases slice.
 */
export const serviceIdParamSchema = z.strictObject({ id: z.uuid("Identificador inválido") }).strict();

export const servicesListQuerySchema = z
  .strictObject({
    active: z
      .enum(["true", "false", "all"])
      .transform((value) => (value === "all" ? "all" : value === "true"))
      .optional()
  })
  .strict();

const serviceDataSchema = z.record(z.string(), z.unknown());

export const serviceCreateBodySchema = z
  .strictObject({
    name: z.string().trim().min(1, "name requerido"),
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
    data: serviceDataSchema.optional(),
    active: z.boolean().optional()
  })
  .strict();

export type ServiceUpdateBody = z.infer<typeof serviceUpdateBodySchema>;

export type ServicesListQuery = z.infer<typeof servicesListQuerySchema>;
