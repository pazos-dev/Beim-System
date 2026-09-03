import { describe, it, expect } from 'vitest'
import type { Product, Category } from '@beim/contracts'
import { HttpCatalogDataSource } from '../HttpCatalogDataSource'

// Type-level check: method signatures must return @beim/contracts types, not any.
type SignatureCheck = {
  listProducts(): Promise<Product[]>
  listCategories(): Promise<Category[]>
  getProductById(id: string): Promise<Product | null>
}

describe('HttpCatalogDataSource', () => {
  it('instantiates with a baseUrl without throwing', () => {
    const dataSource = new HttpCatalogDataSource('https://api.example.com')
    expect(dataSource).toBeInstanceOf(HttpCatalogDataSource)
  })

  it('exposes methods typed against the CatalogDataSource contract', async () => {
    const dataSource: SignatureCheck = new HttpCatalogDataSource(
      'https://api.example.com',
    )
    expect(typeof dataSource.listProducts).toBe('function')
    expect(typeof dataSource.listCategories).toBe('function')
    expect(typeof dataSource.getProductById).toBe('function')
  })

  it('listProducts throws Not implemented', async () => {
    const dataSource = new HttpCatalogDataSource('https://api.example.com')
    await expect(dataSource.listProducts()).rejects.toThrow('Not implemented')
  })

  it('listCategories throws Not implemented', async () => {
    const dataSource = new HttpCatalogDataSource('https://api.example.com')
    await expect(dataSource.listCategories()).rejects.toThrow('Not implemented')
  })

  it('getProductById throws Not implemented', async () => {
    const dataSource = new HttpCatalogDataSource('https://api.example.com')
    await expect(dataSource.getProductById('prod-1')).rejects.toThrow(
      'Not implemented',
    )
  })
})
