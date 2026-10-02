import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuth } from './context'

/** Gate a route on a session (and optionally the admin role). Waits while a reload restores it. */
export function RequireAuth({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { status, user } = useAuth()
  const location = useLocation()
  if (status === 'loading') {
    return <p className="text-sm text-ink-muted">Loading</p>
  }
  if (status === 'anonymous') {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  if (admin && user?.role !== 'admin') {
    return (
      <section className="py-16 text-center">
        <h1 className="text-2xl font-semibold">Not available</h1>
        <p className="mt-2 text-ink-muted">This area is for store administrators.</p>
      </section>
    )
  }
  return children
}
