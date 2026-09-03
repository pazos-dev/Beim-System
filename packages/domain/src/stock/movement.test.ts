import { describe, expect, it } from 'vitest'
import { computeBalanceAfter, createStockMovement } from './movement'

describe('computeBalanceAfter', () => {
  it('computes sale balance (10 + (-3) = 7)', () => {
    expect(computeBalanceAfter(10, -3)).toBe(7)
  })

  it('computes purchase balance (5 + 10 = 15)', () => {
    expect(computeBalanceAfter(5, 10)).toBe(15)
  })

  it('handles zero quantity', () => {
    expect(computeBalanceAfter(10, 0)).toBe(10)
  })
})

describe('createStockMovement', () => {
  it('creates a typed stock movement with the given params', () => {
    const movement = createStockMovement({
      productId: 'p1',
      movementType: 'sale',
      quantity: -3,
      balanceAfter: 7,
      referenceType: 'sale',
      referenceId: 'sale-1',
      detail: 'Venta de producto',
    })
    expect(movement).toEqual({
      productId: 'p1',
      movementType: 'sale',
      quantity: -3,
      balanceAfter: 7,
      referenceType: 'sale',
      referenceId: 'sale-1',
      detail: 'Venta de producto',
    })
  })

  it('creates a movement with optional fields omitted', () => {
    const movement = createStockMovement({
      productId: 'p2',
      movementType: 'purchase',
      quantity: 10,
      balanceAfter: 15,
    })
    expect(movement.productId).toBe('p2')
    expect(movement.movementType).toBe('purchase')
    expect(movement.quantity).toBe(10)
    expect(movement.balanceAfter).toBe(15)
    expect(movement.referenceType).toBeUndefined()
    expect(movement.referenceId).toBeUndefined()
    expect(movement.detail).toBeUndefined()
  })

  it('creates a web_transfer_out movement', () => {
    const movement = createStockMovement({
      productId: 'p1',
      movementType: 'web_transfer_out',
      quantity: -5,
      balanceAfter: 3,
      referenceType: 'stock_transfer',
      referenceId: 'transfer-1',
      detail: 'Salida hacia taller',
    })
    expect(movement.movementType).toBe('web_transfer_out')
    expect(movement.quantity).toBe(-5)
  })
})
