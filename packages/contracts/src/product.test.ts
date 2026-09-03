import { describe, expect, it } from 'vitest'
import { productSchema, type Product } from './product'

function validProduct(): Product {
  return {
    id: 'prod-001',
    productCode: 1,
    name: 'Funda iPhone 15',
    categoryId: 'cat-001',
    price: 1234.56,
    currency: 'UYU',
    stock: 10,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  }
}

describe('productSchema', () => {
  it('parses a valid product with money decimals preserved', () => {
    const product = productSchema.parse(validProduct())
    expect(product.price).toBe(1234.56)
    expect(product.currency).toBe('UYU')
    expect(product.stock).toBe(10)
  })

  it('rejects when the required name field is missing', () => {
    const { name, ...rest } = validProduct()
    void name
    const result = productSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('rejects a type mismatch on price', () => {
    const result = productSchema.safeParse({ ...validProduct(), price: 'not-a-number' })
    expect(result.success).toBe(false)
  })

  it('rejects when required price is missing', () => {
    const { price, ...rest } = validProduct()
    void price
    const result = productSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('rejects an invalid currency value', () => {
    const result = productSchema.safeParse({ ...validProduct(), currency: 'EUR' })
    expect(result.success).toBe(false)
  })

  it('parses a product with compatibleModels as string array', () => {
    const product = productSchema.parse({
      ...validProduct(),
      compatibleModels: ['iPhone 15', 'iPhone 15 Pro'],
    })
    expect(product.compatibleModels).toEqual(['iPhone 15', 'iPhone 15 Pro'])
  })

  it('parses a product without optional fields', () => {
    const product = productSchema.parse(validProduct())
    expect('brand' in product).toBe(false)
    expect('color' in product).toBe(false)
  })
})
