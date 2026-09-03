import { describe, expect, it } from 'vitest'
import { serviceCategorySchema } from '@beim/contracts'
import { toServiceCategoryContract } from './service-category'

function prismaServiceCategoryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cat-1',
    name: 'Reparación',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  }
}

describe('toServiceCategoryContract', () => {
  it('maps a row to a valid ServiceCategory contract', () => {
    const result = toServiceCategoryContract(prismaServiceCategoryRow())
    expect(serviceCategorySchema.parse(result)).toEqual(result)
    expect(result.id).toBe('cat-1')
    expect(result.name).toBe('Reparación')
    expect(result.createdAt).toEqual(new Date('2024-01-01T00:00:00Z'))
  })
})
