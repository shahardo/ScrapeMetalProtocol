import { useState, useCallback } from 'react'
import type { AuthUser } from '../types/auth'

const TOKEN_KEY  = 'smp_auth'
const SERVER_URL = 'http://localhost:3001'

function loadStored(): AuthUser | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}

export interface AuthAPI {
  user:     AuthUser | null
  login:    (username: string, password: string) => Promise<string | null>
  register: (username: string, password: string) => Promise<string | null>
  logout:   () => void
}

export function useAuth(): AuthAPI {
  const [user, setUser] = useState<AuthUser | null>(loadStored)

  const persist = (u: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(u))
    setUser(u)
  }

  const login = useCallback(async (username: string, password: string): Promise<string | null> => {
    try {
      const res  = await fetch(`${SERVER_URL}/auth/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username, password }),
      })
      const data = await res.json() as {
        token?: string; userId?: string; username?: string
        isAdmin?: boolean; error?: string
      }
      if (!res.ok) return data.error ?? 'Login failed'
      persist({ token: data.token!, userId: data.userId!, username: data.username!, isAdmin: data.isAdmin ?? false })
      return null
    } catch {
      return 'Cannot reach the server. Is it running?'
    }
  }, [])

  const register = useCallback(async (username: string, password: string): Promise<string | null> => {
    try {
      const res  = await fetch(`${SERVER_URL}/auth/register`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username, password }),
      })
      const data = await res.json() as {
        token?: string; userId?: string; username?: string
        isAdmin?: boolean; error?: string
      }
      if (!res.ok) return data.error ?? 'Registration failed'
      persist({ token: data.token!, userId: data.userId!, username: data.username!, isAdmin: data.isAdmin ?? false })
      return null
    } catch {
      return 'Cannot reach the server. Is it running?'
    }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setUser(null)
  }, [])

  return { user, login, register, logout }
}
