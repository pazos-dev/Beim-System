import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Prisma } from '@prisma/client'

vi.mock('./prisma', () => ({
  prisma: {
    category: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import { prisma } from './prisma'
import { listCategories, getCategoryById, upsertCategory } from './category'

const mockCategory = {
  id: 'celulares',
  name: 'Celulares',
  code: 'CEL',
  description: 'Smartphones nuevos',
  parentId: null,
  sortOrder: 1,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-02T00:00:00Z'),
} satisfies Prisma.CategoryGetPayload<true>

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listCategories', () => {
  it('returns all categories', async () => {
    vi.mocked(prisma.category.findMany).mockResolvedValue([mockCategory])
    const result = await listCategories()
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('celulares')
    expect(result[0]!.sortOrder).toBe(1)
  })
})

describe('getCategoryById', () => {
  it('returns a category by ID', async () => {
    vi.mocked(prisma.category.findUnique).mockResolvedValue(mockCategory)
    const result = await getCategoryById('celulares')
    expect(result).not.toBeNull()
    expect(result!.name).toBe('Celulares')
  })

  it('returns null when not found', async () => {
    vi.mocked(prisma.category.findUnique).mockResolvedValue(null)
    const result = await getCategoryById('nonexistent')
    expect(result).toBeNull()
  })
})

describe('upsertCategory', () => {
  it('creates a new category when none exists', async () => {
    vi.mocked(prisma.category.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.category.create).mockResolvedValue(mockCategory)
    const result = await upsertCategory({
      id: 'celulares',
      name: 'Celulares',
      code: 'CEL',
      description: 'Smartphones',
    })
    expect(result.id).toBe('celulares')
    expect(prisma.category.create).toHaveBeenCalledOnce()
  })

  it('updates an existing category', async () => {
    vi.mocked(prisma.category.findUnique).mockResolvedValue(mockCategory)
    vi.mocked(prisma.category.update).mockResolvedValue({ ...mockCategory, name: 'Updated' })
    const result = await upsertCategory({
      id: 'celulares',
      name: 'Updated',
      code: 'CEL',
      description: 'Updated desc',
    })
    expect(result.name).toBe('Updated')
    expect(prisma.category.update).toHaveBeenCalledOnce()
  })
})
