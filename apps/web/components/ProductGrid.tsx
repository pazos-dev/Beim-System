import type { Product } from '@beim/contracts'
import { ProductCard } from './ProductCard'

interface ProductGridProps {
  products: Product[]
}

/**
 * Responsive product grid: 1-col mobile, 2-col tablet, 4-col desktop.
 */
export function ProductGrid({ products }: ProductGridProps): React.JSX.Element {
  if (products.length === 0) {
    return (
      <div className="grid place-items-center rounded-card border border-pro-line bg-white py-20">
        <p className="text-sm text-pro-muted">No hay productos para mostrar.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  )
}
