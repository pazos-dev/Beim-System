'use client'

import { useMemo, useState } from 'react'
import type { Client } from '@beim/contracts'
import Link from 'next/link'

interface ClientTableProps {
  clients: Client[]
}

export function ClientTable({ clients }: ClientTableProps): React.JSX.Element {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return clients
    const term = search.toLowerCase()
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        (c.document?.toLowerCase().includes(term) ?? false),
    )
  }, [clients, search])

  if (clients.length === 0) {
    return (
      <div className="rounded-xl border border-pro-line bg-white p-8 text-center shadow-sm">
        <p className="text-pro-muted">No hay clientes registrados</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-pro-line bg-white shadow-sm">
      {/* Search */}
      <div className="border-b border-pro-line p-4">
        <input
          type="text"
          placeholder="Buscar cliente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm rounded-lg border border-pro-line bg-[#f5f8f7] px-3 py-2.5 text-sm focus:border-teal focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal/20"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-pro-line bg-[#f8fafc]">
              <th className="px-4 py-3 text-left text-xs font-bold uppercase text-pro-muted">
                Nombre
              </th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase text-pro-muted">
                Documento
              </th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase text-pro-muted">
                Teléfono
              </th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase text-pro-muted">
                Email
              </th>
              <th className="px-4 py-3 text-right text-xs font-bold uppercase text-pro-muted">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((client) => (
              <tr
                key={client.id}
                className="border-b border-pro-line transition-colors hover:bg-[#f4f7fb]"
              >
                <td className="px-4 py-3 font-medium">{client.name}</td>
                <td className="px-4 py-3 text-pro-muted">{client.document ?? '—'}</td>
                <td className="px-4 py-3 text-pro-muted">{client.phone ?? '—'}</td>
                <td className="px-4 py-3 text-pro-muted">{client.email ?? '—'}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/gestion/clients/${client.id}`}
                    className="inline-flex min-h-[30px] items-center rounded-lg border border-pro-line px-3 text-xs font-bold text-[#334556] transition-colors hover:border-teal hover:text-teal"
                  >
                    Ver
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && clients.length > 0 && (
        <div className="p-4 text-center text-sm text-pro-muted">
          No se encontraron clientes
        </div>
      )}
    </div>
  )
}
