import { describe, expect, it } from 'vitest'
import { serviceItemsTotal, technicalBaseBudget } from './calculation'

describe('serviceItemsTotal', () => {
  it('sums all item prices', () => {
    const items = [
      { price: 100 },
      { price: 200 },
      { price: 50 },
    ]
    expect(serviceItemsTotal(items)).toBe(350)
  })

  it('returns 0 for an empty collection', () => {
    expect(serviceItemsTotal([])).toBe(0)
  })
})

describe('technicalBaseBudget', () => {
  it('subtracts the added items total from the budget', () => {
    const items = [
      { price: 10000 },
      { price: 10000 },
    ]
    expect(technicalBaseBudget(50000, items)).toBe(30000)
  })

  it('floors the result at zero when added total exceeds the budget', () => {
    const items = [
      { price: 15000 },
    ]
    expect(technicalBaseBudget(10000, items)).toBe(0)
  })
})
