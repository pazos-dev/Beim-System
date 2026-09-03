import { listClients } from '@beim/data'
import { ClientTable } from '@/components/client-table'

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
      <ClientTable clients={clients} />
    </div>
  )
}
