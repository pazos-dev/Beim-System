'use client'

import { useState } from 'react'
import type { Client } from '@beim/contracts'
import { createClient, updateClient } from '@/lib/actions/client'

interface ClientFormProps {
  mode: 'create' | 'edit'
  client?: Client
}

export function ClientForm({
  mode,
  client,
}: ClientFormProps): React.JSX.Element {
  const [name, setName] = useState(client?.name ?? '')
  const [document, setDocument] = useState(client?.document ?? '')
  const [phone, setPhone] = useState(client?.phone ?? '')
  const [email, setEmail] = useState(client?.email ?? '')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!name.trim()) {
      setError('El nombre es obligatorio')
      return
    }

    setSubmitting(true)
    const formData = new FormData()
    formData.set('name', name)
    if (document) formData.set('document', document)
    if (phone) formData.set('phone', phone)
    if (email) formData.set('email', email)

    try {
      const result =
        mode === 'edit' && client
          ? await updateClient(client.id, formData)
          : await createClient(formData)
      if (result?.error) {
        setError(result.error)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div>
        <label htmlFor="name" className="mb-1 block text-xs font-bold text-pro-muted">
          Nombre *
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-pro-line px-3 py-2.5 text-sm focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20"
        />
      </div>

      <div>
        <label htmlFor="document" className="mb-1 block text-xs font-bold text-pro-muted">
          Documento
        </label>
        <input
          id="document"
          type="text"
          value={document}
          onChange={(e) => setDocument(e.target.value)}
          className="w-full rounded-lg border border-pro-line px-3 py-2.5 text-sm focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20"
        />
      </div>

      <div>
        <label htmlFor="phone" className="mb-1 block text-xs font-bold text-pro-muted">
          Teléfono
        </label>
        <input
          id="phone"
          type="text"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full rounded-lg border border-pro-line px-3 py-2.5 text-sm focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20"
        />
      </div>

      <div>
        <label htmlFor="email" className="mb-1 block text-xs font-bold text-pro-muted">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-pro-line px-3 py-2.5 text-sm focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20"
        />
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="min-h-[44px] rounded-lg bg-teal font-bold text-white shadow-lg shadow-teal/20 transition-colors hover:bg-teal-dark disabled:opacity-50"
      >
        {mode === 'edit' ? 'Guardar' : 'Crear cliente'}
      </button>
    </form>
  )
}
