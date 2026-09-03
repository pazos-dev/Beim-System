import { describe, it, expect } from 'vitest'
import { productSchema, categorySchema } from '@beim/contracts'
import { MockCatalogDataSource } from '../MockCatalogDataSource'

describe('MockCatalogDataSource', () => {
  const dataSource = new MockCatalogDataSource()

  it('listProducts returns items that satisfy the product schema', async () => {
    const products = await dataSource.listProducts()

    expect(products).toHaveLength(4)
    for (const product of products) {
      const parsed = productSchema.safeParse(product)
      expect(parsed.success).toBe(true)
    }
  })

  it('listCategories returns typed categories', async () => {
    const categories = await dataSource.listCategories()

    expect(categories).toHaveLength(2)
    for (const category of categories) {
      const parsed = categorySchema.safeParse(category)
      expect(parsed.success).toBe(true)
    }
  })

  it('getProductById returns the matching product', async () => {
    const product = await dataSource.getProductById('prod-1')

    expect(product).not.toBeNull()
    expect(product?.id).toBe('prod-1')
    expect(product?.name).toBeTruthy()
  })

  it('getProductById returns null for a missing product', async () => {
    const product = await dataSource.getProductById('missing')

    expect(product).toBeNull()
  })
})
