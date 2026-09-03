import type { OrderItem } from '@beim/contracts'
import type { Prisma } from '@prisma/client'
import { decimalToNumber, type DecimalLike } from './money'

type OrderItemRow = Prisma.OrderItemGetPayload<true>

/**
 * Map a Prisma `OrderItem` row to the `@beim/contracts` `OrderItem` type.
 * Converts BigInt id and Decimal unitPrice to numbers.
 */
export function toOrderItemContract(row: OrderItemRow): OrderItem {
  return {
    id: Number(row.id),
    orderId: row.orderId,
    ...(row.productId != null ? { productId: row.productId } : {}),
    ...(row.productCode != null ? { productCode: row.productCode } : {}),
    productName: row.productName,
    quantity: row.quantity,
    unitPrice: decimalToNumber(row.unitPrice as DecimalLike),
    ...(row.currency != null ? { currency: row.currency } : {}),
  }
}
