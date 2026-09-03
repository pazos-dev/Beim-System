import type { Order } from '@beim/contracts';

export const IPC_CHANNELS = {
  dashboardGetMetrics: 'dashboard:getMetrics',
} as const;

export interface DashboardMetrics {
  clientCount: number;
  recentOrders: Order[];
}

export interface BeimBridge {
  getDashboardMetrics(): Promise<DashboardMetrics>;
}
