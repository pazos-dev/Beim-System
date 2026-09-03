import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockListClients = vi.fn();
const mockListOrders = vi.fn();

vi.mock('@beim/data', () => ({
  get listClients() {
    return mockListClients;
  },
  get listOrders() {
    return mockListOrders;
  },
}));

// We test the handler logic directly, not the full Electron lifecycle.
// The handler function is extracted so it can be tested in isolation.
describe('Dashboard IPC handler', () => {
  let handler: () => Promise<{ clientCount: number; recentOrders: unknown[] }>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const mod = await import('./handler');
    handler = mod.handleDashboardGetMetrics;
  });

  it('maps listClients and listOrders to DashboardMetrics', async () => {
    mockListClients.mockResolvedValueOnce([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ]);
    mockListOrders.mockResolvedValueOnce([
      { id: 'o1', customer: 'Alice', total: 100 },
      { id: 'o2', customer: 'Bob', total: 200 },
      { id: 'o3', customer: 'Charlie', total: 300 },
    ]);

    const result = await handler();

    expect(result.clientCount).toBe(2);
    expect(result.recentOrders).toHaveLength(3);
    expect(mockListClients).toHaveBeenCalledOnce();
    expect(mockListOrders).toHaveBeenCalledOnce();
  });

  it('returns empty defaults when database throws', async () => {
    mockListClients.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await handler();

    expect(result.clientCount).toBe(0);
    expect(result.recentOrders).toEqual([]);
  });

  it('returns empty defaults when listOrders throws', async () => {
    mockListClients.mockResolvedValueOnce([{ id: '1', name: 'Alice' }]);
    mockListOrders.mockRejectedValueOnce(new Error('Connection terminated'));

    const result = await handler();

    expect(result.clientCount).toBe(0);
    expect(result.recentOrders).toEqual([]);
  });

  it('returns empty defaults when both fail', async () => {
    mockListClients.mockRejectedValueOnce(new Error('No DB'));
    mockListOrders.mockRejectedValueOnce(new Error('No DB'));

    const result = await handler();

    expect(result.clientCount).toBe(0);
    expect(result.recentOrders).toEqual([]);
  });
});
