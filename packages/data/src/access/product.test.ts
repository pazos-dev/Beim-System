import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Decimal } from '@prisma/client/runtime/library'
import type { Prisma } from '@prisma/client'

vi.mock('./prisma', () => ({
  prisma: {
    product: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import { prisma } from './prisma'
import { listProducts, getProductById, upsertProduct } from './product'

const mockProduct = {
  id: 'smartphone-premium',
  productCode: 1,
  name: 'Smartphone premium',
  categoryId: 'celulares',
  brand: 'iPhone',
  model: '16 Pro',
  price: new Decimal('35600'),
  currency: 'UYU' as const,
  stock: 8,
  minStock: 2,
  warrantyDays: 30,
  badge: 'Nuevo',
  image: 'assets/iphone16pro-black.png',
  description: '256GB - 5G - Camara pro',
  productType: 'celular',
  compatibleModels: ['iPhone 15', 'iPhone 16'],
  supplierName: 'Distribuidora X',
  supplierLot: 'LOT-1',
  color: 'Negro',
  costPrice: new Decimal('30000'),
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-02T00:00:00Z'),
} satisfies Prisma.ProductGetPayload<true>

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listProducts', () => {
  it('returns all products without filter', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([mockProduct])
    const result = await listProducts()
    expect(result).toHaveLength(1)
    expect(result[0]!.price).toBe(35600)
    expect(result[0]!.categoryId).toBe('celulares')
  })

  it('filters by categoryId when provided', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([mockProduct])
    const result = await listProducts('celulares')
    expect(result).toHaveLength(1)
    expect(prisma.product.findMany).toHaveBeenCalledWith({ where: { categoryId: 'celulares' } })
  })

  it('returns empty array when no products match', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([])
    const result = await listProducts('nonexistent')
    expect(result).toEqual([])
  })
})

describe('getProductById', () => {
  it('returns a product by ID', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(mockProduct)
    const result = await getProductById('smartphone-premium')
    expect(result).not.toBeNull()
    expect(result!.name).toBe('Smartphone premium')
    expect(result!.price).toBe(35600)
  })

  it('returns null when product not found', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(null)
    const result = await getProductById('nonexistent')
    expect(result).toBeNull()
  })
})

describe('upsertProduct', () => {
  it('creates a new product when no productCode match exists', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.product.create).mockResolvedValue(mockProduct)
    const result = await upsertProduct({
      name: 'Smartphone premium',
      categoryId: 'celulares',
      price: 35600,
      productCode: 1,
    })
    expect(result.name).toBe('Smartphone premium')
    expect(prisma.product.create).toHaveBeenCalledOnce()
  })

  it('updates an existing product found by productCode', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(mockProduct)
    vi.mocked(prisma.product.update).mockResolvedValue({ ...mockProduct, name: 'Updated' })
    const result = await upsertProduct({
      name: 'Updated',
      categoryId: 'celulares',
      price: 35600,
      productCode: 1,
    })
    expect(result.name).toBe('Updated')
    expect(prisma.product.update).toHaveBeenCalledOnce()
  })

  it('creates when productCode is null', async () => {
    vi.mocked(prisma.product.create).mockResolvedValue(mockProduct)
    const result = await upsertProduct({
      name: 'New product',
      categoryId: 'celulares',
      price: 1000,
    })
    expect(result.name).toBe('Smartphone premium')
    expect(prisma.product.findUnique).not.toHaveBeenCalled()
  })
})
