import { listClients, listOrders } from '@beim/data';
import type { DashboardMetrics } from '../shared/ipc';

export async function handleDashboardGetMetrics(): Promise<DashboardMetrics> {
  try {
    const [clients, orders] = await Promise.all([listClients(), listOrders()]);
    return {
      clientCount: clients.length,
      recentOrders: orders.slice(0, 10),
    };
  } catch {
    return { clientCount: 0, recentOrders: [] };
  }
}
