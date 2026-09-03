import type { StockMovement } from '@beim/contracts'
import type { Prisma } from '@prisma/client'

type StockMovementRow = Prisma.GestionStockMovementGetPayload<true>

/**
 * Map a Prisma `GestionStockMovement` row to the `@beim/contracts`
 * `StockMovement` type. The BigInt id converts to number; `productId` is
 * required by the contract so nullable rows fall back to an empty string.
 * Optional text fields default to `""` and are omitted when empty.
 */
export function toStockMovementContract(row: StockMovementRow): StockMovement {
  return {
    id: Number(row.id),
    productId: row.productId ?? '',
    movementType: row.movementType,
    quantity: row.quantity,
    balanceAfter: row.balanceAfter,
    ...(row.referenceType ? { referenceType: row.referenceType } : {}),
    ...(row.referenceId ? { referenceId: row.referenceId } : {}),
    ...(row.detail ? { detail: row.detail } : {}),
    createdAt: row.createdAt,
  }
}
