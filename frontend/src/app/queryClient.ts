import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/api/errors'

/** Retry once on network failures and 5xx; a 4xx answer will not change on retry. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false
  return failureCount < 1
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: shouldRetry, refetchOnWindowFocus: false },
  },
})
