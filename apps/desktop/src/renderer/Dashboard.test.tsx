import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import Dashboard from './Dashboard';

const mockGetDashboardMetrics = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'beim', {
    value: { getDashboardMetrics: mockGetDashboardMetrics },
    writable: true,
  });
});

describe('Dashboard', () => {
  it('renders client count and recent orders when data is available', async () => {
    mockGetDashboardMetrics.mockResolvedValueOnce({
      clientCount: 5,
      recentOrders: [
        {
          id: '1',
          customer: 'Alice',
          total: 100,
          status: 'Pagado',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          customer: 'Bob',
          total: 200,
          status: 'Pendiente',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '3',
          customer: 'Charlie',
          total: 300,
          status: 'Enviado',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    // Verify client count in its stat card
    const totalClientsCard = screen.getByText('Total Clients').closest('div')!;
    expect(within(totalClientsCard).getByText('5')).toBeInTheDocument();

    // Verify customer names in the orders table
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Charlie')).toBeInTheDocument();
  });

  it('renders empty state when no data is available', async () => {
    mockGetDashboardMetrics.mockResolvedValueOnce({
      clientCount: 0,
      recentOrders: [],
    });

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText(/no recent orders/i)).toBeInTheDocument();
    });

    // Both stat cards should show 0
    const statCards = screen.getAllByText('0');
    expect(statCards.length).toBeGreaterThanOrEqual(2);
  });

  it('calls getDashboardMetrics on mount', async () => {
    mockGetDashboardMetrics.mockResolvedValueOnce({
      clientCount: 0,
      recentOrders: [],
    });

    render(<Dashboard />);

    expect(mockGetDashboardMetrics).toHaveBeenCalledOnce();
  });
});
