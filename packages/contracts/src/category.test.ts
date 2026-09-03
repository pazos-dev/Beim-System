import { describe, expect, it } from 'vitest'
import { categorySchema, type Category } from './category'

function validCategory(): Category {
  return {
    id: 'cat-001',
    name: 'Accesorios',
    code: 'ACC',
    description: 'Accesorios para celulares',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  }
}

describe('categorySchema', () => {
  it('parses a valid category with required fields', () => {
    const category = categorySchema.parse(validCategory())
    expect(category.name).toBe('Accesorios')
    expect(category.code).toBe('ACC')
    expect(category.description).toBe('Accesorios para celulares')
  })

  it('rejects when the required name field is missing', () => {
    const { name, ...rest } = validCategory()
    void name
    const result = categorySchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('rejects when the required code field is missing', () => {
    const { code, ...rest } = validCategory()
    void code
    const result = categorySchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('parses successfully with optional parentId omitted', () => {
    const category = categorySchema.parse(validCategory())
    expect('parentId' in category).toBe(false)
  })

  it('accepts optional parentId when present', () => {
    const category = categorySchema.parse({ ...validCategory(), parentId: 'cat-000' })
    expect(category.parentId).toBe('cat-000')
  })
})
