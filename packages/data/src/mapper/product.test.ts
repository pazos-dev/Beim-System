import { describe, expect, it } from 'vitest'
import { Decimal } from '@prisma/client/runtime/library'
import type { Prisma } from '@prisma/client'
import { productSchema } from '@beim/contracts'
import { toProductContract } from './product'

type ProductRow = Prisma.ProductGetPayload<true>

function prismaProductRow(overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id: 'smartphone-premium',
    productCode: 1,
    name: 'Smartphone premium',
    categoryId: 'celulares',
    brand: 'iPhone',
    model: '16 Pro',
    price: new Decimal('35600'),
    currency: 'UYU',
    stock: 8,
    badge: 'Nuevo',
    image: 'assets/iphone16pro-black.png',
    description: '256GB - 5G - Camara pro',
    productType: 'celular',
    compatibleModels: ['iPhone 15', 'iPhone 16'],
    supplierName: 'Distribuidora X',
    supplierLot: 'LOT-1',
    minStock: 2,
    warrantyDays: 30,
    color: 'Negro',
    costPrice: new Decimal('30000'),
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-02T00:00:00Z'),
    ...overrides,
  }
}

describe('toProductContract', () => {
  it('maps a fully populated row to a valid Product contract', () => {
    const row = prismaProductRow()
    const result = toProductContract(row)
    expect(productSchema.parse(result)).toEqual(result)
    expect(result.name).toBe('Smartphone premium')
    expect(result.categoryId).toBe('celulares')
  })

  it('converts Decimal price and costPrice to plain numbers', () => {
    const result = toProductContract(prismaProductRow())
    expect(result.price).toBe(35600)
    expect(typeof result.price).toBe('number')
    expect(result.costPrice).toBe(30000)
    expect(typeof result.costPrice).toBe('number')
  })

  it('preserves the compatibleModels array', () => {
    const result = toProductContract(prismaProductRow())
    expect(result.compatibleModels).toEqual(['iPhone 15', 'iPhone 16'])
  })

  it('passes through currency enum value', () => {
    for (const currency of ['UYU', 'USD', 'USDT'] as const) {
      const result = toProductContract(prismaProductRow({ currency }))
      expect(result.currency).toBe(currency)
    }
  })

  it('maps null optional fields to omitted keys', () => {
    const result = toProductContract(
      prismaProductRow({
        productCode: null,
        image: null,
        supplierName: '',
        compatibleModels: [],
      }),
    )
    expect('productCode' in result).toBe(false)
    expect('image' in result).toBe(false)
    expect('supplierName' in result).toBe(false)
    expect('compatibleModels' in result).toBe(false)
  })
})
