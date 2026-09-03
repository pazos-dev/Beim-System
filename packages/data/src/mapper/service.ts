import type { Service } from '@beim/contracts'
import type { Prisma } from '@prisma/client'
import { decimalToNumber, type DecimalLike } from './money'

type ServiceRow = Prisma.GestionServiceGetPayload<true>

/**
 * Map a Prisma `GestionService` row to the `@beim/contracts` `Service` type.
 * Money fields convert Decimal→number; optional text defaults to `""` and is
 * omitted when empty.
 */
export function toServiceContract(row: ServiceRow): Service {
  return {
    id: row.id,
    categoryName: row.categoryName,
    name: row.name,
    costPrice: decimalToNumber(row.costPrice as DecimalLike),
    salePrice: decimalToNumber(row.salePrice as DecimalLike),
    ...(row.durationText ? { durationText: row.durationText } : {}),
    ...(row.warrantyText ? { warrantyText: row.warrantyText } : {}),
    ...(row.notes ? { notes: row.notes } : {}),
    ...(row.productKey ? { productKey: row.productKey } : {}),
    ...(row.productName ? { productName: row.productName } : {}),
    ...(row.brand ? { brand: row.brand } : {}),
    ...(row.model ? { model: row.model } : {}),
    ...(row.active != null ? { active: row.active } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
