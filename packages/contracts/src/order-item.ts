import { z } from 'zod'
import { Currency } from './enums'

/** Legacy `order_items` table. `id` is `bigserial`, quantity must be positive int. */
export const orderItemSchema = z.object({
  id: z.number().int(),
  orderId: z.string(),
  productId: z.string().exactOptional(),
  productCode: z.number().int().exactOptional(),
  productName: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: z.number(),
  currency: Currency.exactOptional(),
})

export type OrderItem = z.infer<typeof orderItemSchema>
