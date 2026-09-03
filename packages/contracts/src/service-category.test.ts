import { describe, expect, it } from 'vitest'
import { serviceCategorySchema, type ServiceCategory } from './service-category'

function validServiceCategory(): ServiceCategory {
  return {
    id: 'service-category-001',
    name: 'Reparación',
    createdAt: new Date('2024-01-01T00:00:00Z'),
  }
}

describe('serviceCategorySchema', () => {
  it('parses a valid service category with required name', () => {
    const category = serviceCategorySchema.parse(validServiceCategory())
    expect(category.name).toBe('Reparación')
    expect(category.id).toBe('service-category-001')
  })

  it('rejects when the required name field is missing', () => {
    const { name, ...rest } = validServiceCategory()
    void name
    const result = serviceCategorySchema.safeParse(rest)
    expect(result.success).toBe(false)
  })
})
