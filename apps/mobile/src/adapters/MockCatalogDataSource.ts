import type { Product, Category } from '@beim/contracts'
import type { CatalogDataSource } from './CatalogDataSource'

const categories: Category[] = [
  {
    id: 'cat-1',
    name: 'Celulares',
    code: 'CEL',
    description: 'Smartphones y accesorios',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  },
  {
    id: 'cat-2',
    name: 'Computadoras',
    code: 'COM',
    description: 'Notebooks y desktops',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  },
]

const products: Product[] = [
  {
    id: 'prod-1',
    productCode: 1001,
    name: 'iPhone 15 Pro',
    categoryId: 'cat-1',
    brand: 'Apple',
    model: 'A2849',
    price: 1500,
    currency: 'USD',
    stock: 5,
    minStock: 2,
    image: 'https://example.com/iphone15.png',
    description: 'Smartphone premium',
    createdAt: new Date('2024-02-01T00:00:00Z'),
    updatedAt: new Date('2024-02-01T00:00:00Z'),
  },
  {
    id: 'prod-2',
    productCode: 1002,
    name: 'Samsung Galaxy S24',
    categoryId: 'cat-1',
    brand: 'Samsung',
    model: 'SM-S921',
    price: 1200,
    currency: 'USD',
    stock: 10,
    minStock: 3,
    description: 'Smartphone Android',
    createdAt: new Date('2024-02-01T00:00:00Z'),
    updatedAt: new Date('2024-02-01T00:00:00Z'),
  },
  {
    id: 'prod-3',
    productCode: 1003,
    name: 'Motorola G54',
    categoryId: 'cat-1',
    brand: 'Motorola',
    model: 'XT2343',
    price: 300,
    currency: 'USD',
    stock: 8,
    description: 'Smartphone gama media',
    createdAt: new Date('2024-02-01T00:00:00Z'),
    updatedAt: new Date('2024-02-01T00:00:00Z'),
  },
  {
    id: 'prod-4',
    productCode: 2001,
    name: 'MacBook Air M3',
    categoryId: 'cat-2',
    brand: 'Apple',
    model: 'A3113',
    price: 1200,
    currency: 'USD',
    stock: 4,
    minStock: 1,
    description: 'Notebook ultraliviana',
    createdAt: new Date('2024-02-01T00:00:00Z'),
    updatedAt: new Date('2024-02-01T00:00:00Z'),
  },
]

export class MockCatalogDataSource implements CatalogDataSource {
  async listProducts(): Promise<Product[]> {
    return products
  }

  async listCategories(): Promise<Category[]> {
    return categories
  }

  async getProductById(id: string): Promise<Product | null> {
    return products.find((product) => product.id === id) ?? null
  }
}
