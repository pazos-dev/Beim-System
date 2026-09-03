import { notFound } from 'next/navigation'
import { getProductById } from '@beim/data'
import { formatPrice, formatStockStatus } from '@/lib/format'

export const runtime = 'nodejs'

interface ProductPageProps {
  params: Promise<{ id: string }>
}

export default async function ProductPage({ params }: ProductPageProps): Promise<React.JSX.Element> {
  const { id } = await params

  let product: Awaited<ReturnType<typeof getProductById>> = null
  try {
    product = await getProductById(id)
  } catch {
    // DB unavailable
  }

  if (product == null) {
    notFound()
  }

  const stockClass =
    product.stock > 3
      ? 'bg-emerald-50 text-emerald-700'
      : product.stock > 0
        ? 'bg-amber-50 text-amber-700'
        : 'bg-red-50 text-red-700'

  return (
    <section className="mx-auto max-w-[940px]">
      <div className="grid gap-8 md:grid-cols-2">
        {/* Gallery */}
        <div className="flex min-h-[380px] items-center justify-center rounded-[18px] border border-pro-line bg-gradient-to-br from-slate-50 to-teal/5 p-7">
          {product.image != null && product.image.length > 0 ? (
            // eslint-disable-next-line @next/next/no-img-element -- external DB-hosted image URLs; next/image optimization not applicable for remote catalog images without a loader
            <img
              src={product.image}
              alt={product.name}
              className="max-h-[350px] max-w-full object-contain"
            />
          ) : (
            <span className="text-sm font-bold text-teal-dark">Sin imagen</span>
          )}
        </div>

        {/* Copy */}
        <div className="flex flex-col gap-4 py-2">
          {/* Brand / Model */}
          {(product.brand != null || product.model != null) && (
            <p className="text-xs font-bold uppercase tracking-wider text-pro-muted">
              {[product.brand, product.model].filter(Boolean).join(' ')}
            </p>
          )}

          {/* Name */}
          <h1 className="font-heading text-[clamp(27px,3vw,38px)] font-extrabold leading-tight tracking-tight text-pro-ink">
            {product.name}
          </h1>

          {/* Price */}
          <p className="font-heading text-3xl font-extrabold text-teal-dark">
            {formatPrice(product.price, product.currency)}
          </p>

          {/* Stock */}
          <div>
            <span className={`inline-block rounded-lg px-3 py-1 text-xs font-extrabold ${stockClass}`}>
              {formatStockStatus(product.stock)} ({product.stock} u.)
            </span>
          </div>

          {/* Description */}
          {product.description != null && product.description.length > 0 && (
            <p className="text-sm leading-relaxed text-pro-muted">{product.description}</p>
          )}

          {/* Specs grid */}
          <div className="mt-2 grid grid-cols-2 gap-2.5">
            {product.brand != null && product.brand.length > 0 && (
              <div className="rounded-xl border border-pro-line bg-slate-50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-pro-muted">Marca</p>
                <p className="mt-1 text-xs font-bold text-pro-ink">{product.brand}</p>
              </div>
            )}
            {product.model != null && product.model.length > 0 && (
              <div className="rounded-xl border border-pro-line bg-slate-50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-pro-muted">Modelo</p>
                <p className="mt-1 text-xs font-bold text-pro-ink">{product.model}</p>
              </div>
            )}
            {product.warrantyDays != null && product.warrantyDays > 0 && (
              <div className="rounded-xl border border-pro-line bg-slate-50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-pro-muted">Garantía</p>
                <p className="mt-1 text-xs font-bold text-pro-ink">{product.warrantyDays} días</p>
              </div>
            )}
            {product.color != null && product.color.length > 0 && (
              <div className="rounded-xl border border-pro-line bg-slate-50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-pro-muted">Color</p>
                <p className="mt-1 text-xs font-bold text-pro-ink">{product.color}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
