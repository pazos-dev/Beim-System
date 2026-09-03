'use client'

import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function LoginPage(): React.JSX.Element {
  const { login } = useAuth()
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const ok = await login(username, password)
    if (ok) {
      router.push('/gestion')
    } else {
      setError('Credenciales inválidas')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f3f6f5]">
      <div className="w-full max-w-sm rounded-2xl border border-pro-line bg-white p-8 shadow-lg">
        <h1 className="font-heading text-2xl font-bold text-pro-ink">
          BEIM Gestión
        </h1>
        <p className="mt-1 text-sm text-pro-muted">Iniciar sesión</p>

        <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
          <div>
            <label className="mb-1 block text-xs font-bold text-pro-muted">
              Usuario
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-pro-line px-3 py-2.5 text-sm focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-pro-muted">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-pro-line px-3 py-2.5 text-sm focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20"
              required
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="min-h-[44px] rounded-lg bg-teal font-bold text-white shadow-lg shadow-teal/20 transition-colors hover:bg-teal-dark"
          >
            Entrar
          </button>
        </form>
      </div>
    </div>
  )
}
