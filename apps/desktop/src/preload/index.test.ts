import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExposeInMainWorld = vi.fn();
const mockInvoke = vi.fn();

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: mockExposeInMainWorld,
  },
  ipcRenderer: {
    invoke: mockInvoke,
  },
}));

describe('Preload bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-require after mock setup to execute the preload side effects
    vi.resetModules();
  });

  it('exposes beim bridge on window via contextBridge', async () => {
    await import('./index');

    expect(mockExposeInMainWorld).toHaveBeenCalledOnce();
    const [key, api] = mockExposeInMainWorld.mock.calls[0]!;

    expect(key).toBe('beim');
    expect(typeof api).toBe('object');
    expect(typeof api['getDashboardMetrics']).toBe('function');
  });

  it('getDashboardMetrics invokes the correct IPC channel', async () => {
    const mockMetrics = { clientCount: 5, recentOrders: [] };
    mockInvoke.mockResolvedValueOnce(mockMetrics);

    await import('./index');
    const api = mockExposeInMainWorld.mock.calls[0]![1] as {
      getDashboardMetrics: () => Promise<typeof mockMetrics>;
    };

    const result = await api.getDashboardMetrics();

    expect(mockInvoke).toHaveBeenCalledWith('dashboard:getMetrics');
    expect(result).toEqual(mockMetrics);
  });

  it('does NOT expose raw ipcRenderer or Node APIs', async () => {
    await import('./index');
    const api = mockExposeInMainWorld.mock.calls[0]![1] as Record<string, unknown>;

    expect(api).not.toHaveProperty('ipcRenderer');
    expect(api).not.toHaveProperty('require');
    expect(api).not.toHaveProperty('process');
    expect(api).not.toHaveProperty('child_process');
  });
});
