import type { ServiceCategory } from '@beim/contracts'
import type { Prisma } from '@prisma/client'

type ServiceCategoryRow = Prisma.GestionServiceCategoryGetPayload<true>

/**
 * Map a Prisma `GestionServiceCategory` row to the contract type.
 */
export function toServiceCategoryContract(row: ServiceCategoryRow): ServiceCategory {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
  }
}
