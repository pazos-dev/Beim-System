import type { Category } from '@beim/contracts'
import type { Prisma } from '@prisma/client'

type CategoryRow = Prisma.CategoryGetPayload<true>

/**
 * Map a Prisma `Category` row to the `@beim/contracts` `Category` type.
 * Handles the self-referential `parentId`.
 */
export function toCategoryContract(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description,
    ...(row.parentId != null ? { parentId: row.parentId } : {}),
    ...(row.sortOrder != null ? { sortOrder: row.sortOrder } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
