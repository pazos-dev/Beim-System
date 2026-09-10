import { z } from "zod";

/**
 * Client edge DTOs (interface layer, G1 clients slice).
 *
 * Byte-identical mirror of the legacy gestion boundary (`schemas.ts`:
 * `clientsListQuerySchema`, `paramIdSchema`, `clientCreateSchema`,
 * `clientUpdateSchema`). Strict zod only: unknown keys 422. The router
 * passes the parsed DTO straight to the injected handler — no rules, no
 * pg, no adapters, no mappers.
 */
export const clientsListQuerySchema = z
  .strictObject({
    active: z
      .enum(["true", "false", "all"])
      .transform((value) => (value === "all" ? "all" : value === "true"))
      .optional(),
    search: z.string().trim().min(1).optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional()
  })
  .strict();

export const clientIdParamSchema = z.strictObject({ id: z.uuid("Identificador inválido") }).strict();

export const clientCreateBodySchema = z
  .strictObject({
    name: z.string().trim().min(1, "name requerido"),
    email: z.string().trim().email("email inválido").optional(),
    phone: z.string().trim().optional()
  })
  .strict();

export const clientUpdateBodySchema = z
  .strictObject({
    name: z.string().trim().min(1, "name requerido").optional(),
    email: z.string().trim().email("email inválido").optional(),
    phone: z.string().trim().optional(),
    active: z.boolean().optional()
  })
  .strict();

export type ClientsListQuery = z.infer<typeof clientsListQuerySchema>;
export type ClientCreateBody = z.infer<typeof clientCreateBodySchema>;
export type ClientUpdateBody = z.infer<typeof clientUpdateBodySchema>;
