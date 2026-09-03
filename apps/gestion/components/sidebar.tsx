'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/gestion', label: 'Dashboard', icon: '📊' },
  { href: '/gestion/clients', label: 'Clientes', icon: '👥' },
] as const

export function Sidebar(): React.JSX.Element {
  const pathname = usePathname()

  return (
    <aside className="flex h-screen w-60 flex-col bg-gradient-to-b from-[#102f3b] to-[#0d2631] p-4 text-white">
      {/* Brand */}
      <div className="mb-6 flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-2">
        <div className="grid h-10 w-12 place-items-center rounded-lg bg-teal font-bold">
          B
        </div>
        <div>
          <div className="text-sm font-bold">BEIM</div>
          <div className="text-xs text-[#a9bdc4]">Panel de Gestión</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === '/gestion'
              ? pathname === '/gestion'
              : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-[#1a5260] text-white shadow-[inset_3px_0_0_#28c2af]'
                  : 'text-[#c5d5da] hover:bg-white/10 hover:text-white'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Website link */}
      <Link
        href="/"
        className="mt-auto rounded-lg border border-white/16 bg-white py-2.5 text-center text-sm font-bold text-[#102f3b] transition-colors hover:bg-[#e8eef6]"
      >
        Ir a la Tienda
      </Link>
    </aside>
  )
}
