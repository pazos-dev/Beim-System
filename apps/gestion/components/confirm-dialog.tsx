'use client'

import { useState } from 'react'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel?: () => void
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirmar',
  onConfirm,
  onCancel,
}: ConfirmDialogProps): React.JSX.Element {
  const [open, setOpen] = useState(false)

  const handleConfirm = () => {
    onConfirm()
    setOpen(false)
  }

  const handleCancel = () => {
    setOpen(false)
    onCancel?.()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[30px] items-center rounded-lg border border-[#f3c4c0] bg-white px-3 text-xs font-bold text-red-600 transition-colors hover:border-red-600 hover:bg-red-600 hover:text-white"
      >
        Eliminar
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        >
          <div className="w-full max-w-sm rounded-2xl border border-pro-line bg-white p-6 shadow-2xl">
            <h3 className="font-heading text-lg font-bold text-pro-ink">
              {title}
            </h3>
            <p className="mt-2 text-sm text-pro-muted">{message}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleCancel}
                className="min-h-[38px] rounded-lg border border-pro-line bg-white px-4 text-sm font-bold text-[#334556] transition-colors hover:border-pro-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="min-h-[38px] rounded-lg bg-red-600 px-4 text-sm font-bold text-white transition-colors hover:bg-red-700"
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
