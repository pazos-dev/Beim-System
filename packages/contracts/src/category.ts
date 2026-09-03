import { z } from 'zod'

/** Legacy `categories` table. */
export const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  description: z.string(),
  parentId: z.string().exactOptional(),
  sortOrder: z.number().int().exactOptional(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Category = z.infer<typeof categorySchema>
