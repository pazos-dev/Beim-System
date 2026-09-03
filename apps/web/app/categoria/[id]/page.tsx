import { listProducts, getCategoryById } from '@beim/data'
import { ProductGrid } from '@/components/ProductGrid'

export const runtime = 'nodejs'

interface CategoryPageProps {
  params: Promise<{ id: string }>
}

export default async function CategoryPage({ params }: CategoryPageProps): Promise<React.JSX.Element> {
  const { id } = await params

  let category: Awaited<ReturnType<typeof getCategoryById>> = null
  let products: Awaited<ReturnType<typeof listProducts>> = []

  try {
    ;[category, products] = await Promise.all([
      getCategoryById(id),
      listProducts(id),
    ])
  } catch {
    // DB unavailable — render empty
  }

  return (
    <section>
      <div className="mb-8">
        <h1 className="font-heading text-4xl font-extrabold tracking-tight text-pro-ink lg:text-5xl">
          {category?.name ?? 'Categoría'}
        </h1>
        {category != null && (
          <p className="mt-3 max-w-[700px] text-pro-muted">{category.description}</p>
        )}
      </div>

      <ProductGrid products={products} />
    </section>
  )
}
