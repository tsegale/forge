import { createContext, use } from 'react'
import type { User } from './session'

export type Status = 'loading' | 'authenticated' | 'anonymous'

export interface AuthContextValue {
  status: Status
  user: User | null
  login: (email: string, password: string) => Promise<User>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = use(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}
