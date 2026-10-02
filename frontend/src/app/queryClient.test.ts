import { describe, expect, it } from 'vitest'
import { ApiError, networkError } from '@/api/errors'
import { shouldRetry } from './queryClient'

describe('shouldRetry', () => {
  it('does not retry client errors', () => {
    expect(shouldRetry(0, new ApiError(404, 'not_found', 'Not found', null, null))).toBe(false)
  })

  it('retries server and network failures once', () => {
    const server = new ApiError(503, 'unavailable', 'Unavailable', null, null)
    expect(shouldRetry(0, server)).toBe(true)
    expect(shouldRetry(1, server)).toBe(false)
    expect(shouldRetry(0, networkError())).toBe(true)
  })
})
