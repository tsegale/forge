import { useEffect, useState } from 'react'

const MAX_TIMEOUT_MS = 2_147_483_647 // setTimeout's limit (about 24.8 days)

/**
 * Whether `expiresAt` (an ISO timestamp) has passed. Re-renders once, at the moment it passes,
 * rather than on every clock tick. Null never expires.
 */
export function useExpired(expiresAt: string | null | undefined): boolean {
  const deadline = expiresAt ? Date.parse(expiresAt) : null
  const [checkedAt, setCheckedAt] = useState(() => Date.now())

  useEffect(() => {
    if (deadline === null) return
    if (deadline <= checkedAt) return
    // Fires at the deadline (immediately if it has already passed since the last check).
    const left = Math.max(0, deadline - Date.now())
    const timer = setTimeout(
      () => {
        setCheckedAt(Date.now())
      },
      Math.min(left, MAX_TIMEOUT_MS),
    )
    return () => {
      clearTimeout(timer)
    }
  }, [deadline, checkedAt])

  return deadline !== null && deadline <= checkedAt
}
