'use client'

import { useAuth } from '@/lib/auth-context'

interface TopbarProps {
  title: string
  subtitle?: string
}

export function Topbar({ title, subtitle }: TopbarProps): React.JSX.Element {
  const { session, logout } = useAuth()

  return (
    <div className="mb-4 grid min-h-[96px] grid-cols-[minmax(220px,1fr)_minmax(280px,440px)_minmax(260px,auto)] items-center gap-4 rounded-xl border border-pro-line bg-white/80 p-4 shadow-sm backdrop-blur-sm">
      {/* Title */}
      <div>
        {subtitle && (
          <p className="text-xs font-medium text-pro-muted">{subtitle}</p>
        )}
        <h1 className="text-2xl font-bold">{title}</h1>
      </div>

      {/* Search placeholder */}
      <div className="flex justify-center">
        <input
          type="text"
          placeholder="Buscar..."
          className="min-h-[44px] w-full rounded-xl border border-[#dde7e5] bg-[#f5f8f7] px-4 text-sm focus:border-teal focus:bg-white focus:outline-none focus:ring-4 focus:ring-teal/10"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3">
        {session && (
          <>
            <span className="text-sm text-pro-muted">{session.name}</span>
            <button
              onClick={logout}
              className="min-h-[38px] rounded-lg border border-pro-line bg-white px-3 text-xs font-bold text-[#334556] transition-colors hover:border-teal hover:text-teal"
            >
              Salir
            </button>
          </>
        )}
      </div>
    </div>
  )
}
