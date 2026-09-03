'use client'

import { createContext, useCallback, useContext, useState } from 'react'

/**
 * Mock session — real auth is deferred to a later slice.
 * This is explicitly NOT a security claim.
 */
export interface MockSession {
  username: string
  name: string
  role: 'administrador'
}

interface AuthContextValue {
  session: MockSession | null
  login: (username: string, password: string) => Promise<boolean>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({
  children,
}: {
  children: React.ReactNode
}): React.JSX.Element {
  const [session, setSession] = useState<MockSession | null>(null)

  const login = useCallback(async (username: string, _password: string) => {
    // TODO: replace with real auth endpoint
    if (username.trim() === '') return false
    setSession({
      username,
      name: username,
      role: 'administrador',
    })
    return true
  }, [])

  const logout = useCallback(() => {
    setSession(null)
  }, [])

  return (
    <AuthContext.Provider value={{ session, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
