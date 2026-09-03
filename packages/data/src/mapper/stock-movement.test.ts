import { describe, expect, it } from 'vitest'
import type { Prisma } from '@prisma/client'
import { stockMovementSchema } from '@beim/contracts'
import { toStockMovementContract } from './stock-movement'

type StockMovementRow = Prisma.GestionStockMovementGetPayload<true>

function prismaStockMovementRow(overrides: Partial<StockMovementRow> = {}): StockMovementRow {
  return {
    id: BigInt(7),
    productId: 'smartphone-premium',
    movementType: 'sale',
    quantity: -2,
    balanceAfter: 8,
    referenceType: 'Order',
    referenceId: 'order-1',
    detail: 'Venta',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  }
}

describe('toStockMovementContract', () => {
  it('maps a fully populated row to a valid StockMovement contract', () => {
    const result = toStockMovementContract(prismaStockMovementRow())
    expect(stockMovementSchema.parse(result)).toEqual(result)
    expect(result.productId).toBe('smartphone-premium')
    expect(result.movementType).toBe('sale')
  })

  it('converts BigInt id to a number', () => {
    const result = toStockMovementContract(prismaStockMovementRow())
    expect(result.id).toBe(7)
    expect(typeof result.id).toBe('number')
  })

  it('keeps integer quantity and balanceAfter', () => {
    const result = toStockMovementContract(prismaStockMovementRow())
    expect(result.quantity).toBe(-2)
    expect(result.balanceAfter).toBe(8)
  })

  it('omits optional fields that are empty strings', () => {
    const result = toStockMovementContract(
      prismaStockMovementRow({ referenceType: '', referenceId: '', detail: '' }),
    )
    expect('referenceType' in result).toBe(false)
    expect('referenceId' in result).toBe(false)
    expect('detail' in result).toBe(false)
  })
})
