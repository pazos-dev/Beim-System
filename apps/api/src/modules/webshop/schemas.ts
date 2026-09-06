/**
 * Webshop route input schemas (PR 4).
 *
 * All webshop payloads are strict objects (unknown keys rejected, 422) —
 * same policy as gestion. Identifiers are UUIDs (products/orders/checkout
 * use the schema's uuid columns). page/limit are coerced from strings with
 * safe bounds (page ≥ 1, limit 1..100, defaults 1/20).
 */
import { z } from "zod";

export const loginSchema = z.strictObject({
  identifier: z.string().min(1, "Identificador requerido").max(120),
  password: z.string().min(1, "Contraseña requerida").max(200)
});

export const registerSchema = z.strictObject({
  name: z.string().min(1, "Nombre requerido").max(120),
  email: z.string().email("Email inválido").max(254),
  password: z
    .string()
    .min(12, "La contraseña debe tener al menos 12 caracteres")
    .max(200)
    .refine(
      (value) => /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value),
      "La contraseña debe incluir mayúscula, minúscula, número y símbolo"
    )
});

export const gestionAccessSchema = z.strictObject({
  token: z.string().min(1, "Token requerido").max(500)
});

export const pageQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export const productListQuerySchema = pageQuerySchema.extend({
  category: z.string().min(1).max(60).optional(),
  search: z.string().min(1).max(120).optional()
});

export const paramUuidSchema = z.strictObject({
  id: z.string().uuid("Identificador inválido")
});

const orderItemSchema = z.strictObject({
  productId: z.string().uuid("Identificador de producto inválido"),
  quantity: z.number().int().min(1, "Cantidad debe ser al menos 1").max(1000)
});

export const orderCreateSchema = z.strictObject({
  customer: z.string().min(1, "Cliente requerido").max(160),
  email: z.string().email("Email inválido").max(254).nullish(),
  phone: z.string().max(40).nullish(),
  ci: z.string().max(20).nullish(),
  rut: z.string().max(20).nullish(),
  address: z.string().max(200).nullish(),
  shipping: z.string().max(60).nullish(),
  comments: z.string().max(500).nullish(),
  items: z.array(orderItemSchema).min(1, "El pedido debe tener al menos un artículo").max(100)
});

export const checkoutSessionCreateSchema = z.strictObject({
  orderId: z.string().uuid("Identificador de orden inválido"),
  paymentMethodId: z.string().min(1).max(60).nullish()
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type OrderCreateInput = z.infer<typeof orderCreateSchema>;
export type CheckoutSessionCreateInput = z.infer<typeof checkoutSessionCreateSchema>;