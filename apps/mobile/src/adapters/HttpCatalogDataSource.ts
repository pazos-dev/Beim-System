import type { Product, Category } from '@beim/contracts'
import type { CatalogDataSource } from './CatalogDataSource'

/**
 * Typed HTTP adapter stub for a future mobile API.
 * Not yet wired to a live backend; methods throw until implemented.
 */
export class HttpCatalogDataSource implements CatalogDataSource {
  constructor(private readonly baseUrl: string) {
    void this.baseUrl
  }

  async listProducts(): Promise<Product[]> {
    throw new Error('Not implemented')
  }

  async listCategories(): Promise<Category[]> {
    throw new Error('Not implemented')
  }

  async getProductById(_id: string): Promise<Product | null> {
    throw new Error('Not implemented')
  }
}
