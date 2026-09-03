import { z } from 'zod'

/** Legacy `gestion_service_categories` table. */
export const serviceCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.date(),
})

export type ServiceCategory = z.infer<typeof serviceCategorySchema>
