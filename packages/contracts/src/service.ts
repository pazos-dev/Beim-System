import { z } from 'zod'

/** Legacy `gestion_services` table. Money fields are `numeric(12,2)` modeled as plain numbers. */
export const serviceSchema = z.object({
  id: z.string(),
  categoryName: z.string(),
  name: z.string(),
  costPrice: z.number(),
  salePrice: z.number(),
  durationText: z.string().exactOptional(),
  warrantyText: z.string().exactOptional(),
  notes: z.string().exactOptional(),
  productKey: z.string().exactOptional(),
  productName: z.string().exactOptional(),
  brand: z.string().exactOptional(),
  model: z.string().exactOptional(),
  active: z.boolean().exactOptional(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Service = z.infer<typeof serviceSchema>
