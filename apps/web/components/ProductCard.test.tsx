import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProductCard } from './ProductCard'
import type { Product } from '@beim/contracts'

const baseProduct: Product = {
  id: 'prod-1',
  name: 'iPhone 15 Pro',
  categoryId: 'cat-1',
  price: 1299,
  currency: 'USD',
  stock: 15,
  brand: 'Apple',
  model: '15 Pro',
  image: '/images/iphone15.jpg',
  description: 'Latest iPhone with A17 Pro chip',
  badge: 'Nuevo',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
}

function makeProduct(overrides: Partial<Product>): Product {
  return { ...baseProduct, ...overrides }
}

describe('ProductCard', () => {
  it('displays the product name', () => {
    render(<ProductCard product={baseProduct} />)
    expect(screen.getByText('iPhone 15 Pro')).toBeInTheDocument()
  })

  it('displays the formatted price with currency', () => {
    render(<ProductCard product={baseProduct} />)
    expect(screen.getByText('US$1.299')).toBeInTheDocument()
  })

  it('displays the brand and model', () => {
    render(<ProductCard product={baseProduct} />)
    expect(screen.getByText('Apple 15 Pro')).toBeInTheDocument()
  })

  it('displays the badge when present', () => {
    render(<ProductCard product={baseProduct} />)
    expect(screen.getByText('Nuevo')).toBeInTheDocument()
  })

  it('does not display badge when not present', () => {
    const { badge: _badge, ...rest } = baseProduct
    const product: Product = { ...rest }
    render(<ProductCard product={product} />)
    expect(screen.queryByText('Nuevo')).not.toBeInTheDocument()
  })

  it('displays stock status for in-stock product', () => {
    render(<ProductCard product={baseProduct} />)
    expect(screen.getByText('En stock')).toBeInTheDocument()
  })

  it('displays out-of-stock status when stock is zero', () => {
    const product = makeProduct({ stock: 0 })
    render(<ProductCard product={product} />)
    expect(screen.getByText('Sin stock')).toBeInTheDocument()
  })

  it('displays product image with alt text', () => {
    render(<ProductCard product={baseProduct} />)
    const img = screen.getByRole('img', { name: /iphone 15 pro/i })
    expect(img).toHaveAttribute('src', '/images/iphone15.jpg')
  })

  it('renders as a link to the product detail page', () => {
    render(<ProductCard product={baseProduct} />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/producto/prod-1')
  })

  it('handles product without optional brand/model gracefully', () => {
    const { brand: _b, model: _m, ...rest } = baseProduct
    const product: Product = { ...rest }
    render(<ProductCard product={product} />)
    expect(screen.getByText('iPhone 15 Pro')).toBeInTheDocument()
    expect(screen.queryByText(/Apple/)).not.toBeInTheDocument()
  })
})
