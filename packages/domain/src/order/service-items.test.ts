import { describe, expect, it } from 'vitest'
import {
  normalizeServiceItems,
  normalizeServiceItemApprovalStatus,
  findDuplicateServiceItemDescriptions,
  commitApprovedServiceItemStockLocally,
  restoreRemovedServiceItemStockLocally,
} from './service-items'

describe('normalizeServiceItemApprovalStatus', () => {
  it('maps aprobado to Aprobado', () => {
    expect(normalizeServiceItemApprovalStatus('aprobado')).toBe('Aprobado')
  })

  it('maps aprobada to Aprobado case-insensitively', () => {
    expect(normalizeServiceItemApprovalStatus('APROBADA')).toBe('Aprobado')
  })

  it('maps rechazado to No aprobado', () => {
    expect(normalizeServiceItemApprovalStatus('rechazado')).toBe('No aprobado')
  })

  it('maps rechazada to No aprobado', () => {
    expect(normalizeServiceItemApprovalStatus('rechazada')).toBe('No aprobado')
  })

  it('maps no aprobado to No aprobado', () => {
    expect(normalizeServiceItemApprovalStatus('no aprobado')).toBe('No aprobado')
  })

  it('defaults unknown values to Pendiente', () => {
    expect(normalizeServiceItemApprovalStatus('otro')).toBe('Pendiente')
  })

  it('defaults empty string to Pendiente', () => {
    expect(normalizeServiceItemApprovalStatus('')).toBe('Pendiente')
  })
})

describe('normalizeServiceItems', () => {
  it('filters out source:"initial" items', () => {
    const items = [
      { source: 'initial', price: 100, quantity: 1, description: 'A' },
      { source: 'added', price: 200, quantity: 1, description: 'B' },
    ]
    const result = normalizeServiceItems(items)
    expect(result).toHaveLength(1)
    const first = result[0]
    expect(first?.description).toBe('B')
    expect(first?.price).toBe(200)
  })

  it('coerces string price and quantity to numbers', () => {
    const items = [
      { source: 'added', price: '500', quantity: '2', description: 'X' },
    ]
    const result = normalizeServiceItems(items)
    const first = result[0]
    expect(first?.price).toBe(500)
    expect(first?.quantity).toBe(2)
  })

  it('normalizes approval status case-insensitively', () => {
    const items = [
      { source: 'added', price: 100, quantity: 1, description: 'S', approvalStatus: 'aprobada' },
    ]
    const result = normalizeServiceItems(items)
    const first = result[0]
    expect(first?.approvalStatus).toBe('Aprobado')
  })

  it('defaults quantity to 1 when missing', () => {
    const items = [
      { source: 'added', price: 100, description: 'S' },
    ]
    const result = normalizeServiceItems(items)
    const first = result[0]
    expect(first?.quantity).toBe(1)
  })

  it('returns empty array for non-array input', () => {
    expect(normalizeServiceItems(undefined)).toEqual([])
  })
})

describe('findDuplicateServiceItemDescriptions', () => {
  it('detects duplicate descriptions', () => {
    const items = [
      { description: 'Cambio SSD' },
      { description: 'Limpieza' },
      { description: 'Cambio SSD' },
    ]
    expect(findDuplicateServiceItemDescriptions(items)).toEqual(['Cambio SSD'])
  })

  it('returns empty when no duplicates', () => {
    const items = [
      { description: 'Cambio SSD' },
      { description: 'Limpieza' },
    ]
    expect(findDuplicateServiceItemDescriptions(items)).toEqual([])
  })

  it('detects multiple duplicate groups', () => {
    const items = [
      { description: 'A' },
      { description: 'B' },
      { description: 'A' },
      { description: 'B' },
    ]
    const result = findDuplicateServiceItemDescriptions(items)
    expect(result).toContain('A')
    expect(result).toContain('B')
    expect(result).toHaveLength(2)
  })
})

describe('commitApprovedServiceItemStockLocally', () => {
  it('deducts stock for approved items with productId', () => {
    const stockMap = new Map([
      ['p1', 10],
      ['p2', 5],
    ])
    const items = [
      { productId: 'p1', quantity: 3, approvalStatus: 'Aprobado', stockDeducted: false },
      { productId: 'p2', quantity: 1, approvalStatus: 'Pendiente', stockDeducted: false },
    ]
    const result = commitApprovedServiceItemStockLocally(stockMap, items)
    expect(result.get('p1')).toBe(7)
    expect(result.get('p2')).toBe(5)
  })

  it('skips items already stock-deducted', () => {
    const stockMap = new Map([['p1', 10]])
    const items = [
      { productId: 'p1', quantity: 3, approvalStatus: 'Aprobado', stockDeducted: true },
    ]
    const result = commitApprovedServiceItemStockLocally(stockMap, items)
    expect(result.get('p1')).toBe(10)
  })

  it('skips items with No aprobado status', () => {
    const stockMap = new Map([['p1', 10]])
    const items = [
      { productId: 'p1', quantity: 3, approvalStatus: 'No aprobado', stockDeducted: false },
    ]
    const result = commitApprovedServiceItemStockLocally(stockMap, items)
    expect(result.get('p1')).toBe(10)
  })

  it('does not mutate the original map', () => {
    const stockMap = new Map([['p1', 10]])
    const items = [
      { productId: 'p1', quantity: 3, approvalStatus: 'Aprobado', stockDeducted: false },
    ]
    commitApprovedServiceItemStockLocally(stockMap, items)
    expect(stockMap.get('p1')).toBe(10)
  })

  it('skips items without productId', () => {
    const stockMap = new Map([['p1', 10]])
    const items = [
      { productId: '', quantity: 3, approvalStatus: 'Aprobado', stockDeducted: false },
    ]
    const result = commitApprovedServiceItemStockLocally(stockMap, items)
    expect(result.get('p1')).toBe(10)
  })
})

describe('restoreRemovedServiceItemStockLocally', () => {
  it('restores stock for items with productId and positive quantity', () => {
    const stockMap = new Map([
      ['p1', 7],
      ['p2', 5],
    ])
    const items = [
      { productId: 'p1', quantity: 3 },
      { productId: 'p2', quantity: 1 },
    ]
    const result = restoreRemovedServiceItemStockLocally(stockMap, items)
    expect(result.get('p1')).toBe(10)
    expect(result.get('p2')).toBe(6)
  })

  it('skips items without productId', () => {
    const stockMap = new Map([['p1', 7]])
    const items = [{ productId: '', quantity: 3 }]
    const result = restoreRemovedServiceItemStockLocally(stockMap, items)
    expect(result.get('p1')).toBe(7)
  })

  it('skips items with zero quantity', () => {
    const stockMap = new Map([['p1', 7]])
    const items = [{ productId: 'p1', quantity: 0 }]
    const result = restoreRemovedServiceItemStockLocally(stockMap, items)
    expect(result.get('p1')).toBe(7)
  })

  it('does not mutate the original map', () => {
    const stockMap = new Map([['p1', 7]])
    const items = [{ productId: 'p1', quantity: 3 }]
    restoreRemovedServiceItemStockLocally(stockMap, items)
    expect(stockMap.get('p1')).toBe(7)
  })
})
