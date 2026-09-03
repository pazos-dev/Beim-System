import type { User } from '@beim/contracts'
import type { Prisma } from '@prisma/client'

type UserRow = Prisma.UserGetPayload<true>

/**
 * Map a Prisma `User` row to the `@beim/contracts` `User` type.
 * Pure type conversion: snake_case → camelCase, null → omitted key.
 */
export function toUserContract(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    ...(row.firstName != null ? { firstName: row.firstName } : {}),
    ...(row.lastName != null ? { lastName: row.lastName } : {}),
    ...(row.username != null ? { username: row.username } : {}),
    ...(row.email != null ? { email: row.email } : {}),
    passwordHash: row.passwordHash,
    role: row.role,
    ...(row.phone != null ? { phone: row.phone } : {}),
    ...(row.company != null ? { company: row.company } : {}),
    ...(row.ci != null ? { ci: row.ci } : {}),
    ...(row.rut != null ? { rut: row.rut } : {}),
    ...(row.department != null ? { department: row.department } : {}),
    ...(row.locality != null ? { locality: row.locality } : {}),
    ...(row.address != null ? { address: row.address } : {}),
    ...(row.website != null ? { website: row.website } : {}),
    ...(row.tradeReferences != null ? { tradeReferences: row.tradeReferences } : {}),
    ...(row.isWholesaler != null ? { isWholesaler: row.isWholesaler } : {}),
    ...(row.isBeim != null ? { isBeim: row.isBeim } : {}),
    ...(row.isApproved != null ? { isApproved: row.isApproved } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
