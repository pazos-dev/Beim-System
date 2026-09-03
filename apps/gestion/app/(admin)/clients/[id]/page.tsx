import { getClientById } from '@beim/data'
import Link from 'next/link'

export const runtime = 'nodejs'

interface Params {
  id: string
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<Params>
}): Promise<React.JSX.Element> {
  const { id } = await params
  let client: Awaited<ReturnType<typeof getClientById>> = null
  try {
    client = await getClientById(id)
  } catch {
    // DB unavailable
  }

  if (!client) {
    return (
      <div className="rounded-xl border border-pro-line bg-white p-8 text-center shadow-sm">
        <h2 className="font-heading text-xl font-bold">Cliente no encontrado</h2>
        <p className="mt-2 text-pro-muted">
          No se pudo encontrar el cliente solicitado.
        </p>
        <Link
          href="/gestion/clients"
          className="mt-4 inline-block text-sm font-bold text-teal hover:text-teal-dark"
        >
          Volver a clientes
        </Link>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-pro-line bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-heading text-xl font-bold">{client.name}</h2>
        <Link
          href="/gestion/clients"
          className="text-sm font-bold text-teal hover:text-teal-dark"
        >
          Volver
        </Link>
      </div>
      <dl className="grid grid-cols-2 gap-4">
        <div>
          <dt className="text-xs font-bold text-pro-muted">Documento</dt>
          <dd className="mt-1 text-sm">{client.document ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold text-pro-muted">Teléfono</dt>
          <dd className="mt-1 text-sm">{client.phone ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold text-pro-muted">Email</dt>
          <dd className="mt-1 text-sm">{client.email ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold text-pro-muted">Estado</dt>
          <dd className="mt-1 text-sm">
            {client.active ? (
              <span className="inline-flex items-center rounded-full bg-[#dff7f1] px-2 py-0.5 text-xs font-bold text-[#08735f]">
                Activo
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-[#eef1f5] px-2 py-0.5 text-xs font-bold text-[#667085]">
                Inactivo
              </span>
            )}
          </dd>
        </div>
      </dl>
    </div>
  )
}
