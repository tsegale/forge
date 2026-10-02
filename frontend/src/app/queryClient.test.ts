import { QueryClient } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, unwrap } from '@/api/client'
import { ApiError, networkError, parseRetryAfter } from '@/api/errors'
import { server } from '@/test/server'
import { retryDelay, shouldRetry } from './queryClient'

const apiError = (status: number, retryAfterMs: number | null = null) =>
  new ApiError(status, 'code', 'message', null, null, retryAfterMs)

afterEach(() => {
  vi.useRealTimers()
})

describe('shouldRetry', () => {
  it('does not retry client errors', () => {
    expect(shouldRetry(0, apiError(404))).toBe(false)
    expect(shouldRetry(0, apiError(422))).toBe(false)
  })

  it('retries server and network failures once', () => {
    expect(shouldRetry(0, apiError(503))).toBe(true)
    expect(shouldRetry(1, apiError(503))).toBe(false)
    expect(shouldRetry(0, networkError())).toBe(true)
  })

  it('retries a 429 once, after Retry-After, unless the wait is too long or unknown', () => {
    expect(shouldRetry(0, apiError(429, 2000))).toBe(true)
    expect(retryDelay(0, apiError(429, 2000))).toBe(2000)
    expect(shouldRetry(1, apiError(429, 2000))).toBe(false)
    expect(shouldRetry(0, apiError(429, 120_000))).toBe(false)
    expect(shouldRetry(0, apiError(429))).toBe(false)
  })
})

describe('parseRetryAfter', () => {
  it('reads seconds and HTTP dates', () => {
    const now = Date.parse('2026-10-02T10:00:00Z')
    expect(parseRetryAfter('3', now)).toBe(3000)
    expect(parseRetryAfter('Fri, 02 Oct 2026 10:00:05 GMT', now)).toBe(5000)
    expect(parseRetryAfter('Fri, 02 Oct 2026 09:00:00 GMT', now)).toBe(0)
    expect(parseRetryAfter('soon', now)).toBeNull()
    expect(parseRetryAfter(null, now)).toBeNull()
  })
})

describe('a rate-limited query', () => {
  it('waits for Retry-After, then succeeds on the retry', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let calls = 0
    server.use(
      http.get('/api/v1/component-kinds', () => {
        calls += 1
        if (calls === 1) {
          return HttpResponse.json(
            { error: { code: 'rate_limited', message: 'Slow down.', details: null, request_id: 'r' } },
            { status: 429, headers: { 'Retry-After': '2' } },
          )
        }
        return HttpResponse.json({ items: [] })
      }),
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: shouldRetry, retryDelay } } })
    const result = client.query({
      queryKey: ['kinds'],
      queryFn: () => unwrap(api.GET('/api/v1/component-kinds')),
    })
    await vi.waitFor(() => {
      expect(calls).toBe(1)
    })
    await vi.advanceTimersByTimeAsync(1500)
    expect(calls).toBe(1) // still waiting out Retry-After
    await vi.advanceTimersByTimeAsync(600)
    await expect(result).resolves.toEqual({ items: [] })
    expect(calls).toBe(2)
  })
})
