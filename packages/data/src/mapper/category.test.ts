import { describe, expect, it } from 'vitest'
import type { Prisma } from '@prisma/client'
import { categorySchema } from '@beim/contracts'
import { toCategoryContract } from './category'

type CategoryRow = Prisma.CategoryGetPayload<true>

function prismaCategoryRow(overrides: Partial<CategoryRow> = {}): CategoryRow {
  return {
    id: 'celulares',
    name: 'Celulares',
    code: 'CEL',
    description: 'Smartphones nuevos',
    parentId: null,
    sortOrder: 1,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-02T00:00:00Z'),
    ...overrides,
  }
}

describe('toCategoryContract', () => {
  it('maps a top-level category row (no parent)', () => {
    const result = toCategoryContract(prismaCategoryRow())
    expect(categorySchema.parse(result)).toEqual(result)
    expect(result.id).toBe('celulares')
    expect(result.sortOrder).toBe(1)
    expect('parentId' in result).toBe(false)
  })

  it('maps a child category with a parentId', () => {
    const result = toCategoryContract(prismaCategoryRow({ parentId: 'servicio' }))
    expect(result.parentId).toBe('servicio')
    expect(result.id).toBe('celulares')
  })

  it('converts snake_case to camelCase for scalar fields', () => {
    const result = toCategoryContract(prismaCategoryRow())
    expect(result.createdAt).toEqual(new Date('2024-01-01T00:00:00Z'))
    expect(result.updatedAt).toEqual(new Date('2024-01-02T00:00:00Z'))
    expect(result.description).toBe('Smartphones nuevos')
  })
})
