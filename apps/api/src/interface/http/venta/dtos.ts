import { z } from "zod";

/**
 * Venta slice DTOs (interface layer, Unidad 4).
 *
 * Edge validation only: strict objects (unknown keys → 422), uuid ids,
 * closed currency set (mirrors the domain `CURRENCIES`), quantities 1..1000
 * and batch sizes 1..100 (mirrors the webshop order bounds). Shapes mirror
 * the application handler inputs (`ConfirmSalesBatchInput`,
 * `CreateOrderInput`, `MintCheckoutSessionInput`) so the router only
 * forwards already-valid payloads. Value rules stay in the domain; both
 * layers surface failures as 422 through the frozen envelope.
 */

const uuidMessage = "Identificador inválido: debe ser un uuid";

const ventaLineSchema = z.strictObject({
  productId: z.string().uuid(uuidMessage),
  quantity: z.number().int().min(1, "Cantidad debe ser al menos 1").max(1000)
});

const ventaPaymentSchema = z.strictObject({
  method: z.string().trim().min(1, "method requerido").max(120),
  amount: z.number().nonnegative("amount no puede ser negativo"),
  currency: z.enum(["UYU", "USD", "USDT"])
});

/** Counter (`mostrador`) batch sale → `confirmBatch`. */
export const salesBatchBodySchema = z.strictObject({
  ventaId: z.string().uuid(uuidMessage),
  lines: z.array(ventaLineSchema).min(1, "La venta debe tener al menos una línea").max(100),
  payments: z.array(ventaPaymentSchema).min(1, "La venta debe tener al menos un pago").max(100)
});

/** Webshop order → `createOrder` (server-side pricing from locked rows). */
export const orderCreateBodySchema = z.strictObject({
  orderId: z.string().uuid(uuidMessage),
  lines: z.array(ventaLineSchema).min(1, "El pedido debe tener al menos una línea").max(100)
});

/** Checkout preference mint → `mintCheckoutSession`. */
export const checkoutSessionBodySchema = z.strictObject({
  orderId: z.string().uuid(uuidMessage)
});

export type SalesBatchBody = z.infer<typeof salesBatchBodySchema>;
export type OrderCreateBody = z.infer<typeof orderCreateBodySchema>;
export type CheckoutSessionBody = z.infer<typeof checkoutSessionBodySchema>;
