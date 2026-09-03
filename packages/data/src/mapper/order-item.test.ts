import { describe, expect, it } from 'vitest'
import { Decimal } from '@prisma/client/runtime/library'
import type { Prisma } from '@prisma/client'
import { orderItemSchema } from '@beim/contracts'
import { toOrderItemContract } from './order-item'

type OrderItemRow = Prisma.OrderItemGetPayload<true>

function prismaOrderItemRow(overrides: Partial<OrderItemRow> = {}): OrderItemRow {
  return {
    id: BigInt(12),
    orderId: 'order-1',
    productId: 'smartphone-premium',
    productCode: 1,
    productName: 'Smartphone premium',
    quantity: 3,
    unitPrice: new Decimal('35600'),
    currency: 'UYU',
    ...overrides,
  }
}

describe('toOrderItemContract', () => {
  it('maps a row to a valid OrderItem contract', () => {
    const result = toOrderItemContract(prismaOrderItemRow())
    expect(orderItemSchema.parse(result)).toEqual(result)
    expect(result.id).toBe(12)
    expect(result.orderId).toBe('order-1')
    expect(result.productName).toBe('Smartphone premium')
  })

  it('converts BigInt id and Decimal unitPrice to numbers', () => {
    const result = toOrderItemContract(prismaOrderItemRow())
    expect(typeof result.id).toBe('number')
    expect(result.id).toBe(12)
    expect(result.unitPrice).toBe(35600)
    expect(typeof result.unitPrice).toBe('number')
  })

  it('omits productCode and productId when absent', () => {
    const result = toOrderItemContract(
      prismaOrderItemRow({ productId: null, productCode: null }),
    )
    expect('productCode' in result).toBe(false)
    expect('productId' in result).toBe(false)
  })

  it('keeps quantity as a positive integer', () => {
    const result = toOrderItemContract(prismaOrderItemRow({ quantity: 1 }))
    expect(result.quantity).toBe(1)
  })
})
