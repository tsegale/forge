import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { Forbidden } from '@/pages/NotFound'
import { useAuth } from './context'

/** Gate a route on a session (and optionally the admin role). Waits while a reload restores it. */
export function RequireAuth({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { status, user } = useAuth()
  const location = useLocation()
  if (status === 'loading') {
    return (
      <p className="py-16 text-center text-sm text-ink-muted" aria-live="polite">
        Checking your session
      </p>
    )
  }
  if (status === 'anonymous') {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  if (admin && user?.role !== 'admin') {
    return <Forbidden />
  }
  return children
}
