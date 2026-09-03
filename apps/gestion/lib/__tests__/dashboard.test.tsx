import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DashboardContent } from '@/app/(admin)/dashboard-content'

vi.mock('@beim/data', () => ({
  listClients: vi.fn(),
}))

describe('Dashboard', () => {
  it('renders metrics with client count', async () => {
    const { listClients } = await import('@beim/data')
    vi.mocked(listClients).mockResolvedValue([
      { id: '1', name: 'Ana Perez', active: true, createdAt: new Date(), updatedAt: new Date() },
      { id: '2', name: 'Carlos Lopez', active: true, createdAt: new Date(), updatedAt: new Date() },
    ])
    render(<DashboardContent clientCount={2} />)
    expect(screen.getByText('Clientes Activos')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('renders zero state for empty data', () => {
    render(<DashboardContent clientCount={0} />)
    expect(screen.getByText('Clientes Activos')).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
  })
})
