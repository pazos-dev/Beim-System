import type { Product } from '@beim/contracts'
import type { Prisma } from '@prisma/client'
import { decimalToNumber, type DecimalLike } from './money'

type ProductRow = Prisma.ProductGetPayload<true>

/**
 * Map a Prisma `Product` row to the `@beim/contracts` `Product` type.
 * Converts Decimal money fields to numbers and array/null fields faithfully.
 */
export function toProductContract(row: ProductRow): Product {
  return {
    id: row.id,
    ...(row.productCode != null ? { productCode: row.productCode } : {}),
    name: row.name,
    categoryId: row.categoryId,
    ...(row.brand ? { brand: row.brand } : {}),
    ...(row.model ? { model: row.model } : {}),
    price: decimalToNumber(row.price as DecimalLike),
    currency: row.currency,
    stock: row.stock,
    ...(row.minStock != null ? { minStock: row.minStock } : {}),
    ...(row.warrantyDays != null ? { warrantyDays: row.warrantyDays } : {}),
    ...(row.badge ? { badge: row.badge } : {}),
    ...(row.image != null ? { image: row.image } : {}),
    ...(row.description ? { description: row.description } : {}),
    ...(row.productType ? { productType: row.productType } : {}),
    ...(row.compatibleModels?.length ? { compatibleModels: row.compatibleModels } : {}),
    ...(row.supplierName ? { supplierName: row.supplierName } : {}),
    ...(row.supplierLot ? { supplierLot: row.supplierLot } : {}),
    ...(row.color ? { color: row.color } : {}),
    ...(row.costPrice != null ? { costPrice: decimalToNumber(row.costPrice as DecimalLike) } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
