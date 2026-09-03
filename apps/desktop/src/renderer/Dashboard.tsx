import { useEffect, useState } from 'react';
import type { DashboardMetrics } from '../shared/ipc';

export default function Dashboard(): JSX.Element {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);

  useEffect(() => {
    window.beim.getDashboardMetrics().then(setMetrics);
  }, []);

  if (!metrics) {
    return <div className="p-8 text-gray-500">Loading...</div>;
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 gap-6 mb-8">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-sm font-medium text-gray-500">Total Clients</h2>
          <p className="mt-2 text-3xl font-semibold">{metrics.clientCount}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-sm font-medium text-gray-500">Recent Orders</h2>
          <p className="mt-2 text-3xl font-semibold">{metrics.recentOrders.length}</p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold">Recent Orders ({metrics.recentOrders.length})</h2>
        </div>
        {metrics.recentOrders.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-500">No recent orders</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 text-left text-sm text-gray-500">
                <th className="px-6 py-3">ID</th>
                <th className="px-6 py-3">Customer</th>
                <th className="px-6 py-3">Total</th>
                <th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {metrics.recentOrders.map((order) => (
                <tr key={order.id} className="border-b border-gray-50">
                  <td className="px-6 py-3 text-sm">{order.id}</td>
                  <td className="px-6 py-3 text-sm">{order.customer}</td>
                  <td className="px-6 py-3 text-sm">{order.total}</td>
                  <td className="px-6 py-3 text-sm">{order.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
