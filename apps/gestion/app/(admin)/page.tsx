import { listClients } from '@beim/data'
import { DashboardContent } from './dashboard-content'

export const runtime = 'nodejs'

export default async function DashboardPage(): Promise<React.JSX.Element> {
  let clientCount = 0
  try {
    const clients = await listClients()
    clientCount = clients.length
  } catch {
    // DB unavailable — render with zero counts
  }

  return <DashboardContent clientCount={clientCount} />
}
