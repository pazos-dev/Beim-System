import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ClientForm } from '@/components/client-form'

vi.mock('@/lib/actions/client', () => ({
  createClient: vi.fn().mockResolvedValue({}),
  updateClient: vi.fn().mockResolvedValue({}),
}))

describe('ClientForm', () => {
  it('rejects empty name and shows inline error', async () => {
    const user = userEvent.setup()
    render(<ClientForm mode="create" />)

    const nameInput = screen.getByLabelText(/nombre/i)
    const submitBtn = screen.getByRole('button', { name: /crear cliente/i })

    await user.clear(nameInput)
    await user.click(submitBtn)

    expect(screen.getByText('El nombre es obligatorio')).toBeInTheDocument()
  })

  it('submits valid client data in create mode', async () => {
    const user = userEvent.setup()
    render(<ClientForm mode="create" />)

    await user.type(screen.getByLabelText(/nombre/i), 'Ana Perez')
    await user.type(screen.getByLabelText(/documento/i), '12345678')
    await user.click(screen.getByRole('button', { name: /crear cliente/i }))

    const { createClient } = await import('@/lib/actions/client')
    expect(createClient).toHaveBeenCalled()
  })

  it('shows initial values in edit mode', () => {
    render(
      <ClientForm
        mode="edit"
        client={{
          id: 'c1',
          name: 'Carlos Lopez',
          document: '87654321',
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }}
      />,
    )
    expect(screen.getByLabelText(/nombre/i)).toHaveValue('Carlos Lopez')
    expect(screen.getByRole('button', { name: /guardar/i })).toBeInTheDocument()
  })
})
