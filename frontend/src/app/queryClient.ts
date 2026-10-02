import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/api/errors'

const MAX_RETRIES = 1
/** Longer waits than this are shown as an error rather than a page that silently stalls. */
const MAX_RATE_LIMIT_WAIT_MS = 30_000

function isRateLimited(error: unknown): error is ApiError & { retryAfterMs: number } {
  return error instanceof ApiError && error.status === 429 && error.retryAfterMs !== null
}

/**
 * Retry once on network failures and 5xx. A 4xx answer will not change on retry, except 429,
 * which is retried once the server's Retry-After has passed.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_RETRIES) return false
  if (isRateLimited(error)) return error.retryAfterMs <= MAX_RATE_LIMIT_WAIT_MS
  return !(error instanceof ApiError && error.status >= 400 && error.status < 500)
}

/** Wait as long as a 429 asks; otherwise back off exponentially (1 s, 2 s, ... up to 30 s). */
export function retryDelay(failureCount: number, error: unknown): number {
  if (isRateLimited(error)) return error.retryAfterMs
  return Math.min(1000 * 2 ** failureCount, 30_000)
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: shouldRetry, retryDelay, refetchOnWindowFocus: false },
  },
})
