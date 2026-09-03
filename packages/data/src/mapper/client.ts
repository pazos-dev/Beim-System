import type { Client } from '@beim/contracts'
import type { Prisma } from '@prisma/client'

type ClientRow = Prisma.GestionClientGetPayload<true>

/**
 * Map a Prisma `GestionClient` row to the `@beim/contracts` `Client` type.
 * Optional fields default to `""` in the DB, so they are omitted when empty.
 */
export function toClientContract(row: ClientRow): Client {
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    ...(row.document ? { document: row.document } : {}),
    ...(row.phone ? { phone: row.phone } : {}),
    ...(row.email ? { email: row.email } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
