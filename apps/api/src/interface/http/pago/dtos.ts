import { z } from "zod";

/**
 * Pago slice DTOs (interface layer, Unidad 6).
 *
 * Edge validation only. Order ids stay lax (`min(1).max(120)`, mirrors the
 * legacy `paramOrderIdSchema`): `orders.id` is TEXT and legacy rows are not
 * uuid-shaped — the handler owns 404/409. The MercadoPago webhook body is a
 * catchall (NEVER strict): MP sends many more fields than these and extra
 * keys must not 422; `id`/`data.id` accept numbers because MP serializes
 * them either way, both normalized to strings (mirrors `mpWebhookSchema`).
 */

const mpIdSchema = z.union([z.string().min(1), z.number()]).transform((value) => String(value));

/** `POST /orders/:id/payment-preference` path (lax legacy order id). */
export const pagoOrderIdParamSchema = z.strictObject({
  id: z.string().min(1, "Identificador requerido").max(120)
});

/** `POST /webhooks/mercadopago` body (catchall, provider-shaped). */
export const pagoWebhookBodySchema = z
  .object({
    id: mpIdSchema,
    live_mode: z.union([z.boolean(), z.string(), z.number()]).optional(),
    type: z.string().min(1),
    action: z.string().optional(),
    data: z.object({ id: mpIdSchema }).catchall(z.unknown())
  })
  .catchall(z.unknown());

export type PagoOrderIdParam = z.infer<typeof pagoOrderIdParamSchema>;
export type PagoWebhookBody = z.infer<typeof pagoWebhookBodySchema>;
