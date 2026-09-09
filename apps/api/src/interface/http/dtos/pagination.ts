import { z } from "zod";

/**
 * Shared pagination DTO (interface layer, Unidad 1 shared skin).
 *
 * Edge validation only: coerces query strings, enforces page >= 1 and
 * limit 1..100 with defaults 1/20, and rejects unknown keys (strict).
 * Mirrors the webshop `pageQuerySchema` bounds; failures surface as 422
 * through the shared `validate` middleware. No behavior change.
 */
export const paginationSchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export type PaginationInput = z.infer<typeof paginationSchema>;
