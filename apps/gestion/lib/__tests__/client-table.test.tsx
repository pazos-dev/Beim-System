import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ClientTable } from '@/components/client-table'
import type { Client } from '@beim/contracts'

const mockClients: Client[] = [
  {
    id: '1',
    name: 'Ana Perez',
    document: '12345678',
    phone: '59899111111',
    email: 'ana@test.com',
    active: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
  {
    id: '2',
    name: 'Carlos Lopez',
    document: '87654321',
    phone: '59899222222',
    email: 'carlos@test.com',
    active: true,
    createdAt: new Date('2024-01-02'),
    updatedAt: new Date('2024-01-02'),
  },
]

describe('ClientTable', () => {
  it('renders all client rows', () => {
    render(<ClientTable clients={mockClients} />)
    expect(screen.getByText('Ana Perez')).toBeInTheDocument()
    expect(screen.getByText('Carlos Lopez')).toBeInTheDocument()
  })

  it('shows document, phone, and email for each client', () => {
    render(<ClientTable clients={mockClients} />)
    expect(screen.getByText('12345678')).toBeInTheDocument()
    expect(screen.getByText('59899111111')).toBeInTheDocument()
    expect(screen.getByText('ana@test.com')).toBeInTheDocument()
  })

  it('filters clients by name (case-insensitive)', async () => {
    const user = userEvent.setup()
    render(<ClientTable clients={mockClients} />)

    const searchInput = screen.getByPlaceholderText('Buscar cliente...')
    await user.type(searchInput, 'ana')

    expect(screen.getByText('Ana Perez')).toBeInTheDocument()
    expect(screen.queryByText('Carlos Lopez')).not.toBeInTheDocument()
  })

  it('filters clients by document', async () => {
    const user = userEvent.setup()
    render(<ClientTable clients={mockClients} />)

    const searchInput = screen.getByPlaceholderText('Buscar cliente...')
    await user.type(searchInput, '8765')

    expect(screen.getByText('Carlos Lopez')).toBeInTheDocument()
    expect(screen.queryByText('Ana Perez')).not.toBeInTheDocument()
  })

  it('shows empty state when no clients match search', async () => {
    const user = userEvent.setup()
    render(<ClientTable clients={mockClients} />)

    const searchInput = screen.getByPlaceholderText('Buscar cliente...')
    await user.type(searchInput, 'zzz')

    expect(screen.getByText('No se encontraron clientes')).toBeInTheDocument()
  })

  it('shows empty state when clients list is empty', () => {
    render(<ClientTable clients={[]} />)
    expect(screen.getByText('No hay clientes registrados')).toBeInTheDocument()
  })
})
