import type { Category } from '@beim/contracts'

interface CategoryNavProps {
  categories: Category[]
}

/**
 * Horizontal category navigation bar. Renders in the app shell header area.
 * Always includes a "Todos" link to the home page.
 */
export function CategoryNav({ categories }: CategoryNavProps): React.JSX.Element {
  return (
    <nav className="mx-auto w-full max-w-[1510px] overflow-visible rounded-2xl bg-navy p-1">
      <div className="grid w-full grid-flow-col gap-1" style={{ gridAutoColumns: 'minmax(0, 1fr)' }}>
        <a
          href="/"
          className="min-h-[46px] rounded-[14px] px-3.5 text-center text-sm font-bold text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
        >
          Todos
        </a>
        {categories.map((cat) => (
          <a
            key={cat.id}
            href={`/categoria/${cat.id}`}
            className="min-h-[46px] rounded-[14px] px-3.5 text-center text-sm font-bold text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
          >
            {cat.name}
          </a>
        ))}
      </div>
    </nav>
  )
}
