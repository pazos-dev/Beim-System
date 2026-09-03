'use client'

import { useRouter } from 'next/navigation'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { deleteClient } from '@/lib/actions/client'
import { useState } from 'react'

export function DeleteClientButton({ clientId }: { clientId: string }): React.JSX.Element {
  const router = useRouter()
  const [error, setError] = useState('')

  const handleDelete = async () => {
    const result = await deleteClient(clientId)
    if (result?.error) {
      setError(result.error)
      return
    }
    router.push('/gestion/clients')
    router.refresh()
  }

  return (
    <div>
      <ConfirmDialog
        title="Eliminar cliente"
        message="¿Estás seguro de que querés eliminar este cliente? Esta acción lo ocultará del listado."
        confirmLabel="Eliminar"
        onConfirm={handleDelete}
      />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  )
}
