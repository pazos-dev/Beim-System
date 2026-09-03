import type { Product } from '@beim/contracts'
import Link from 'next/link'
import { formatPrice, formatStockStatus } from '@/lib/format'

interface ProductCardProps {
  product: Product
}

/**
 * Product card for the catalog grid. Displays image, name, brand, price, and stock.
 * Links to the product detail page.
 */
export function ProductCard({ product }: ProductCardProps): React.JSX.Element {
  const stockClass =
    product.stock > 3
      ? 'bg-emerald-50 text-emerald-700'
      : product.stock > 0
        ? 'bg-amber-50 text-amber-700'
        : 'bg-red-50 text-red-700'

  return (
    <Link
      href={`/producto/${product.id}`}
      className="group relative block overflow-hidden rounded-card border border-pro-line bg-white transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
    >
      {/* Badge */}
      {product.badge != null && product.badge.length > 0 && (
        <span className="absolute left-3 top-3 z-10 rounded-lg bg-teal px-2.5 py-1 text-xs font-extrabold text-white">
          {product.badge}
        </span>
      )}

      {/* Image */}
      <div className="flex h-[220px] items-center justify-center bg-gradient-to-br from-slate-50 to-teal/5 p-5">
        {product.image != null && product.image.length > 0 ? (
          // eslint-disable-next-line @next/next/no-img-element -- external DB-hosted image URLs; next/image optimization not applicable for remote catalog images without a loader
          <img
            src={product.image}
            alt={product.name}
            className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-sm font-bold text-teal-dark">
            Sin imagen
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col gap-1.5 p-4">
        {/* Brand + Model */}
        {(product.brand != null || product.model != null) && (
          <p className="text-right text-xs font-bold text-pro-muted">
            {[product.brand, product.model].filter(Boolean).join(' ')}
          </p>
        )}

        {/* Name */}
        <h3 className="font-heading text-base font-bold leading-tight text-pro-ink">
          {product.name}
        </h3>

        {/* Description preview */}
        {product.description != null && product.description.length > 0 && (
          <p className="line-clamp-2 text-xs text-pro-muted">
            {product.description}
          </p>
        )}

        {/* Price + Stock */}
        <div className="mt-auto flex items-end justify-between border-t border-slate-100 pt-3">
          <span className="font-heading text-lg font-extrabold text-pro-ink">
            {formatPrice(product.price, product.currency)}
          </span>
          <span className={`rounded-md px-2 py-0.5 text-[10px] font-extrabold ${stockClass}`}>
            {formatStockStatus(product.stock)}
          </span>
        </div>
      </div>
    </Link>
  )
}
