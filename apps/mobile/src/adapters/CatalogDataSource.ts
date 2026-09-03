import type { Product, Category } from '@beim/contracts'

export interface CatalogDataSource {
  listProducts(): Promise<Product[]>
  listCategories(): Promise<Category[]>
  getProductById(id: string): Promise<Product | null>
}
