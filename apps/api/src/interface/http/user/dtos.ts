import { z } from "zod";
import { paginationSchema } from "../dtos/pagination.js";

/**
 * User/Auth slice DTOs (interface layer, Unidad 2).
 *
 * Edge validation only: strict objects (unknown keys rejected as 422),
 * uuid ids, and the shared pagination skin (page >= 1, limit 1..100,
 * defaults 1/20 — the same effective bounds the legacy services clamp to).
 * Values mirror the legacy `gestion/schemas.ts` + `webshop/schemas.ts`
 * user/auth schemas byte-for-byte in behavior; zero observable change.
 */

/** Password policy shared by webshop register and console user creation. */
const passwordSchema = z
  .string()
  .min(12, "La contraseña debe tener al menos 12 caracteres")
  .max(200)
  .refine(
    (value) => /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value),
    "La contraseña debe incluir mayúscula, minúscula, número y símbolo"
  );

/** Closed webshop role list — mirrors the users_role_check constraint. */
const webshopRoleEnum = z.enum(["cliente", "admin", "superadmin"]);

/** Closed console role list — mirrors the gestion_users operator roles. */
const consoleRoleEnum = z.enum(["vendedor", "tecnico", "caja", "administrador", "administrador_principal"]);

/** Query booleans arrive as strings: "false" must map to false. */
const booleanQuerySchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true")
  .optional();

export const loginSchema = z.strictObject({
  identifier: z.string().min(1, "Identificador requerido").max(120),
  password: z.string().min(1, "Contraseña requerida").max(200)
});

export const registerSchema = z.strictObject({
  name: z.string().min(1, "Nombre requerido").max(120),
  email: z.string().email("Email inválido").max(254),
  password: passwordSchema
});

export const gestionAccessSchema = z.strictObject({
  token: z.string().min(1, "Token requerido").max(500)
});

export const gestionLoginSchema = z.strictObject({
  username: z.string().min(1, "Usuario requerido").max(120),
  password: z.string().min(1, "Contraseña requerida").max(200)
});

export const userIdParamSchema = z.strictObject({
  id: z.string().uuid("Identificador inválido")
});

export const usersListQuerySchema = paginationSchema.extend({
  role: webshopRoleEnum.optional(),
  approved: booleanQuerySchema
});

export const userRoleBodySchema = z.strictObject({
  role: webshopRoleEnum
});

export const gestionUsersListQuerySchema = paginationSchema.extend({
  role: consoleRoleEnum.optional(),
  active: booleanQuerySchema,
  search: z.string().trim().min(1).optional()
});

export const gestionUserCreateSchema = z.strictObject({
  username: z.string().trim().min(1, "username requerido").max(120),
  name: z.string().trim().min(1, "name requerido").max(120),
  password: passwordSchema,
  role: consoleRoleEnum
});

export const gestionUserRoleBodySchema = z.strictObject({
  role: consoleRoleEnum
});

export const gestionUserPasswordBodySchema = z.strictObject({
  password: passwordSchema
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type GestionAccessInput = z.infer<typeof gestionAccessSchema>;
export type GestionLoginInput = z.infer<typeof gestionLoginSchema>;
export type UsersListQuery = z.infer<typeof usersListQuerySchema>;
export type GestionUsersListQuery = z.infer<typeof gestionUsersListQuerySchema>;
export type GestionUserCreateInput = z.infer<typeof gestionUserCreateSchema>;
