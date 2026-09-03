import { z } from 'zod'

/** Legacy `gestion_clients` table. */
export const clientSchema = z.object({
  id: z.string(),
  name: z.string(),
  document: z.string().exactOptional(),
  phone: z.string().exactOptional(),
  email: z.string().exactOptional(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Client = z.infer<typeof clientSchema>
