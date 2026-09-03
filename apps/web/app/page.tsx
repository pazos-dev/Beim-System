import { listProducts } from '@beim/data'
import { ProductGrid } from '@/components/ProductGrid'

export const runtime = 'nodejs'

export default async function HomePage(): Promise<React.JSX.Element> {
  let products: Awaited<ReturnType<typeof listProducts>> = []
  try {
    products = await listProducts()
  } catch {
    // DB unavailable — show empty state
  }

  return (
    <section>
      {/* Hero / Intro */}
      <div className="mb-8">
        <h1 className="font-heading text-4xl font-extrabold tracking-tight text-pro-ink lg:text-5xl">
          Catálogo
        </h1>
        <p className="mt-3 max-w-[700px] text-pro-muted">
          Explorá todos nuestros productos. Encontrá celulares, accesorios y más.
        </p>
      </div>

      {/* Product grid */}
      <ProductGrid products={products} />
    </section>
  )
}
