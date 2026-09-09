import { z } from "zod";

/**
 * Catalog slice DTOs (interface layer, gap-slice G4).
 *
 * Edge validation only: strict objects (unknown keys → 422), page/limit as
 * coerced ints with the legacy bounds (page ≥ 1, limit 1..100, defaults
 * 1/20), category/search filters like the legacy
 * `webshop/schemas.ts` `productListQuerySchema`, and uuid params like the
 * legacy `paramUuidSchema` (`products.id` IS uuid-shaped on this read path —
 * the lax TEXT note covers the gestion write lane and order cancel only).
 * Shapes mirror the legacy webshop boundary so the thin router forwards an
 * already-valid query; published-only visibility stays in the adapter's SQL.
 */

/** `GET /products` query: same keys as the legacy webshop router. */
export const catalogListQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  category: z.string().min(1).max(60).optional(),
  search: z.string().min(1).max(120).optional()
});

/** `GET /products/:id` params: uuid, exactly like legacy. */
export const catalogIdParamSchema = z.strictObject({ id: z.uuid("Identificador inválido") });

export type CatalogListQuery = z.infer<typeof catalogListQuerySchema>;
