import { z } from 'zod'
import { StockMovementType } from './enums'

/** Legacy `gestion_stock_movements` table. `id` is `bigserial`, quantity/balanceAfter are integers. */
export const stockMovementSchema = z.object({
  id: z.number().int(),
  productId: z.string(),
  movementType: StockMovementType,
  quantity: z.number().int(),
  balanceAfter: z.number().int(),
  referenceType: z.string().exactOptional(),
  referenceId: z.string().exactOptional(),
  detail: z.string().exactOptional(),
  createdAt: z.date(),
})

export type StockMovement = z.infer<typeof stockMovementSchema>
