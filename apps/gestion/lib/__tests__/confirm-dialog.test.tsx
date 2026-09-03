import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from '@/components/confirm-dialog'

describe('ConfirmDialog', () => {
  it('opens the dialog and confirms (calls onConfirm)', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onCancel = vi.fn()

    render(
      <ConfirmDialog
        title="Eliminar cliente"
        message="Esta acción no se puede deshacer."
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )

    // Open dialog
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    // Confirm
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes on cancel without calling onConfirm (cancelled delete)', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onCancel = vi.fn()

    render(
      <ConfirmDialog
        title="Eliminar cliente"
        message="Esta acción no se puede deshacer."
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )

    // Open dialog
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    // Cancel — the "Deletion cancelled" path
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    // Verifies no delete call is made (spec: "Deletion cancelled")
    expect(onConfirm).not.toHaveBeenCalled()
    // Cancel triggers the optional onCancel callback
    expect(onCancel).toHaveBeenCalledTimes(1)
    // Dialog closes
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders a custom confirm label', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()

    render(
      <ConfirmDialog
        title="Eliminar cliente"
        message="Borrar de forma definitiva."
        confirmLabel="Borrar"
        onConfirm={onConfirm}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(screen.getByRole('button', { name: 'Borrar' })).toBeInTheDocument()
  })
})
