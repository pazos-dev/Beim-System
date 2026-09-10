import { z } from "zod";

/**
 * Category edge DTOs (interface layer, G1 categories slice).
 *
 * Byte-identical mirror of the legacy gestion boundary (`schemas.ts`:
 * `catalogActiveQuerySchema`, `paramStringIdSchema`, `categoryCreateSchema`,
 * `categoryUpdateSchema`). Strict zod only: unknown keys 422. Category ids
 * are text (not uuid) — the string-id param schema applies to updates,
 * mirroring legacy exactly (legacy `GET /:id` carries no param validation).
 */
export const categoriesListQuerySchema = z
  .strictObject({
    active: z
      .enum(["true", "false", "all"])
      .transform((value) => (value === "all" ? "all" : value === "true"))
      .optional()
  })
  .strict();

export const categoryIdParamSchema = z
  .strictObject({ id: z.string().trim().min(1, "Identificador inválido") })
  .strict();

export const categoryCreateBodySchema = z
  .strictObject({
    id: z.string().trim().min(1, "id requerido"),
    name: z.string().trim().min(1, "name requerido"),
    code: z.string().trim().min(1, "code requerido")
  })
  .strict();

export const categoryUpdateBodySchema = z
  .strictObject({
    name: z.string().trim().min(1, "name requerido").optional(),
    code: z.string().trim().min(1, "code requerido").optional(),
    active: z.boolean().optional()
  })
  .strict();

export type CategoriesListQuery = z.infer<typeof categoriesListQuerySchema>;
export type CategoryCreateBody = z.infer<typeof categoryCreateBodySchema>;
export type CategoryUpdateBody = z.infer<typeof categoryUpdateBodySchema>;
