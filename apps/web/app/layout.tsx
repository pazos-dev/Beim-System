import type { Metadata } from 'next'
import './globals.css'
import { listCategories } from '@beim/data'

export const metadata: Metadata = {
  title: 'BEIM — Tienda Online',
  description: 'Tienda oficial BEIM — Celulares, accesorios y más.',
}

export const runtime = 'nodejs'

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}): Promise<React.JSX.Element> {
  let categories: Awaited<ReturnType<typeof listCategories>> = []
  try {
    categories = await listCategories()
  } catch {
    // DB unavailable — render shell without categories
  }

  return (
    <html lang="es">
      <body className="min-h-screen bg-[#f5f8f9] text-pro-ink font-sans">
        {/* Header */}
        <header className="sticky top-0 z-50 border-b border-pro-line/80 bg-white/94 shadow-[0_8px_30px_rgba(22,55,75,.055)] backdrop-blur-[18px]">
          <div className="mx-auto flex max-w-[1510px] items-center gap-6 px-6 py-4">
            {/* Brand */}
            <a href="/" className="flex items-center gap-3 text-pro-ink no-underline">
              <span className="font-heading text-2xl font-extrabold tracking-tight">BEIM</span>
              <span className="hidden text-xs text-pro-muted sm:block">Tienda oficial</span>
            </a>

            {/* Category nav */}
            <div className="flex-1 overflow-x-auto">
              <nav className="mx-auto w-full max-w-[1510px] overflow-visible rounded-2xl bg-navy p-1">
                <div
                  className="grid w-full grid-flow-col gap-1"
                  style={{ gridAutoColumns: 'minmax(0, 1fr)' }}
                >
                  <a
                    href="/"
                    className="min-h-[42px] rounded-[14px] px-3 text-center text-[13px] font-bold text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    Todos
                  </a>
                  {categories.map((cat) => (
                    <a
                      key={cat.id}
                      href={`/categoria/${cat.id}`}
                      className="min-h-[42px] rounded-[14px] px-3 text-center text-[13px] font-bold text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      {cat.name}
                    </a>
                  ))}
                </div>
              </nav>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="mx-auto max-w-[1510px] px-6 py-6">{children}</main>

        {/* Footer */}
        <footer className="mx-auto flex max-w-[1510px] items-center justify-between border-t border-pro-line px-6 py-9 text-sm text-pro-muted">
          <div>
            <span className="font-heading font-extrabold text-pro-ink">BEIM</span>
            <span className="ml-2">© {new Date().getFullYear()}</span>
          </div>
          <p className="max-w-[600px] text-right text-xs leading-relaxed">
            Tienda oficial BEIM — Celulares, accesorios y tecnología.
          </p>
        </footer>
      </body>
    </html>
  )
}
