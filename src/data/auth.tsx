import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, ApiError } from '../lib/api'
import type { Role } from '../lib/types'

export const NO_ACCESS = "This account doesn't have access to the CRM. Ask Constance to add it."

interface AuthState {
  status: 'loading' | 'out' | 'in'
  email: string | null
  role: Role | null
  notice: string | null
  signIn(email: string, password: string): Promise<string | null>
  signOut(notice?: string): Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>('loading')
  const [email, setEmail] = useState<string | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    api<{ email: string; role: Role }>('GET', '/me')
      .then((me) => {
        setEmail(me.email)
        setRole(me.role)
        setStatus('in')
      })
      .catch((e) => {
        if (e instanceof ApiError && e.code === 'no_access') setNotice(NO_ACCESS)
        setStatus('out')
      })
  }, [])

  const signOut = useCallback(async (msg?: string) => {
    await api('POST', '/logout').catch(() => {})
    setEmail(null)
    setRole(null)
    setNotice(msg ?? null)
    setStatus('out')
  }, [])

  const signIn = useCallback(
    async (em: string, pw: string) => {
      try {
        const r = await api<{ email: string; role: Role | null }>('POST', '/login', { email: em.trim(), password: pw })
        if (!r.role) {
          await signOut(NO_ACCESS)
          return NO_ACCESS
        }
        setNotice(null)
        setEmail(r.email)
        setRole(r.role)
        setStatus('in')
        return null
      } catch (e) {
        if (e instanceof ApiError && e.status === 429) return e.message
        if (e instanceof ApiError && e.status === 401) return 'Wrong email or password. Try again.'
        return "Couldn't reach the CRM. Check your connection and try again."
      }
    },
    [signOut],
  )

  return <Ctx.Provider value={{ status, email, role, notice, signIn, signOut }}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth outside AuthProvider')
  return c
}

export function useIsAdmin(): boolean {
  return useAuth().role === 'admin'
}
