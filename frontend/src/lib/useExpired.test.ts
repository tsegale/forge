import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useExpired } from './useExpired'

beforeEach(() => {
  vi.useFakeTimers({ now: Date.parse('2026-10-06T10:00:00Z') })
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useExpired', () => {
  it('flips once, when the deadline passes', () => {
    const { result } = renderHook(() => useExpired('2026-10-06T10:15:00Z'))
    expect(result.current).toBe(false)
    act(() => {
      vi.advanceTimersByTime(15 * 60_000 - 1)
    })
    expect(result.current).toBe(false)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe(true)
  })

  it('is expired at once for a past deadline, and never for none', () => {
    expect(renderHook(() => useExpired('2026-10-06T09:59:59Z')).result.current).toBe(true)
    expect(renderHook(() => useExpired(null)).result.current).toBe(false)
  })

  it('catches a deadline that arrives already past', () => {
    const { result, rerender } = renderHook(({ at }) => useExpired(at), {
      initialProps: { at: '2026-10-06T10:15:00Z' },
    })
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    rerender({ at: '2026-10-06T10:00:30Z' })
    act(() => {
      vi.advanceTimersByTime(0)
    })
    expect(result.current).toBe(true)
  })
})
