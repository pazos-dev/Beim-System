import { listClients } from '@beim/data'
import { ClientTable } from '@/components/client-table'
import { ClientForm } from '@/components/client-form'

export const runtime = 'nodejs'

export default async function ClientsPage(): Promise<React.JSX.Element> {
  let clients: Awaited<ReturnType<typeof listClients>> = []
  try {
    clients = await listClients()
  } catch {
    // DB unavailable — render empty state
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-heading text-xl font-bold">Clientes</h2>
      </div>

      {/* Inline create form */}
      <div className="mb-6 rounded-xl border border-pro-line bg-white p-6 shadow-sm">
        <h3 className="mb-4 font-heading text-base font-bold">
          Nuevo Cliente
        </h3>
        <ClientForm mode="create" />
      </div>

      <ClientTable clients={clients} />
    </div>
  )
}
