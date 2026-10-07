import { createContext, use } from 'react'
import type { User } from './session'

export type Status = 'loading' | 'authenticated' | 'anonymous'

export interface AuthContextValue {
  status: Status
  user: User | null
  login: (email: string, password: string) => Promise<User>
  logout: () => Promise<void>
  /** After a profile change: the API's updated copy of the signed-in user. */
  replaceUser: (user: User) => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * Whose data user-specific queries hold: the user's id, 'guest', or null while a reload is still
 * restoring the session (queries keyed by it wait, rather than fetching as a guest by mistake).
 */
export type SessionKey = number | 'guest' | null

export function useSessionKey(): SessionKey {
  const { status, user } = useAuth()
  if (status === 'loading') return null
  return user?.id ?? 'guest'
}

export function useAuth(): AuthContextValue {
  const value = use(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}
