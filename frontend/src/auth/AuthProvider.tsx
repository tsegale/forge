import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AuthContext, type AuthContextValue, type Status } from './context'
import * as session from './session'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState<session.User | null>(null)
  const [status, setStatus] = useState<Status>('loading')

  useEffect(() => {
    let active = true
    session
      .restore()
      .then((restored) => {
        if (!active) return
        setUser(restored)
        setStatus(restored ? 'authenticated' : 'anonymous')
      })
      .catch(() => {
        if (active) setStatus('anonymous')
      })
    const stop = session.onSessionEnded(() => {
      setUser(null)
      setStatus('anonymous')
      queryClient.clear() // never show one user's data to the next
    })
    return () => {
      active = false
      stop()
    }
  }, [queryClient])

  const login = useCallback(
    async (email: string, password: string) => {
      const signedIn = await session.login(email, password)
      queryClient.clear() // the guest cart was merged server-side; refetch everything as this user
      setUser(signedIn)
      setStatus('authenticated')
      return signedIn
    },
    [queryClient],
  )

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, logout: session.logout }),
    [status, user, login],
  )
  return <AuthContext value={value}>{children}</AuthContext>
}
