import { z } from 'zod'
import { UserRole } from './enums'

/** Legacy `users` table. */
export const userSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  firstName: z.string().exactOptional(),
  lastName: z.string().exactOptional(),
  username: z.string().exactOptional(),
  email: z.string().exactOptional(),
  passwordHash: z.string(),
  role: UserRole,
  phone: z.string().exactOptional(),
  company: z.string().exactOptional(),
  ci: z.string().exactOptional(),
  rut: z.string().exactOptional(),
  department: z.string().exactOptional(),
  locality: z.string().exactOptional(),
  address: z.string().exactOptional(),
  website: z.string().exactOptional(),
  tradeReferences: z.string().exactOptional(),
  isWholesaler: z.boolean().exactOptional(),
  isBeim: z.boolean().exactOptional(),
  isApproved: z.boolean().exactOptional(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type User = z.infer<typeof userSchema>
