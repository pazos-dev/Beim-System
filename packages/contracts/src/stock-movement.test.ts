import { describe, expect, it } from 'vitest'
import { stockMovementSchema, type StockMovement } from './stock-movement'

function validStockMovement(): StockMovement {
  return {
    id: 1,
    productId: 'prod-001',
    movementType: 'sale',
    quantity: -2,
    balanceAfter: 8,
    createdAt: new Date('2024-01-01T00:00:00Z'),
  }
}

describe('stockMovementSchema', () => {
  it('parses a valid stock movement with integer quantity and balance', () => {
    const movement = stockMovementSchema.parse(validStockMovement())
    expect(movement.productId).toBe('prod-001')
    expect(movement.movementType).toBe('sale')
    expect(movement.quantity).toBe(-2)
    expect(movement.balanceAfter).toBe(8)
  })

  it('rejects when the required productId field is missing', () => {
    const { productId, ...rest } = validStockMovement()
    void productId
    const result = stockMovementSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('rejects an invalid movementType enum value', () => {
    const result = stockMovementSchema.safeParse({ ...validStockMovement(), movementType: 'invalid' })
    expect(result.success).toBe(false)
  })

  it('rejects a non-integer quantity', () => {
    const result = stockMovementSchema.safeParse({ ...validStockMovement(), quantity: 2.5 })
    expect(result.success).toBe(false)
  })

  it('rejects a non-integer balanceAfter', () => {
    const result = stockMovementSchema.safeParse({ ...validStockMovement(), balanceAfter: 8.5 })
    expect(result.success).toBe(false)
  })

  it('parses successfully with optional fields omitted', () => {
    const movement = stockMovementSchema.parse(validStockMovement())
    expect('referenceType' in movement).toBe(false)
    expect('detail' in movement).toBe(false)
  })

  it('accepts optional fields when present', () => {
    const movement = stockMovementSchema.parse({
      ...validStockMovement(),
      referenceType: 'order',
      referenceId: 'ord-001',
      detail: 'Venta online',
    })
    expect(movement.referenceType).toBe('order')
    expect(movement.referenceId).toBe('ord-001')
    expect(movement.detail).toBe('Venta online')
  })
})
