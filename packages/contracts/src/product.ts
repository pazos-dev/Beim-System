import { z } from 'zod'
import { Currency } from './enums'

/** Legacy `products` table. Money is `numeric(12,2)` modeled as plain number. */
export const productSchema = z.object({
  id: z.string(),
  productCode: z.number().int().exactOptional(),
  name: z.string(),
  categoryId: z.string(),
  brand: z.string().exactOptional(),
  model: z.string().exactOptional(),
  price: z.number(),
  currency: Currency,
  stock: z.number().int(),
  minStock: z.number().int().exactOptional(),
  warrantyDays: z.number().int().exactOptional(),
  badge: z.string().exactOptional(),
  image: z.string().exactOptional(),
  description: z.string().exactOptional(),
  productType: z.string().exactOptional(),
  compatibleModels: z.array(z.string()).exactOptional(),
  supplierName: z.string().exactOptional(),
  supplierLot: z.string().exactOptional(),
  color: z.string().exactOptional(),
  costPrice: z.number().exactOptional(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Product = z.infer<typeof productSchema>
