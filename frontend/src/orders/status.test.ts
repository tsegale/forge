import { describe, expect, it } from 'vitest'
import { timeline } from './status'

const at = (minute: number) => `2026-10-06T10:${String(minute).padStart(2, '0')}:00Z`

describe('timeline', () => {
  it('shows what happened, then the steps still to come', () => {
    const steps = timeline('paid', [
      { from_status: 'pending_payment', to_status: 'paid', at: at(5) },
      { from_status: null, to_status: 'pending_payment', at: at(1) },
    ])
    expect(steps.map((s) => [s.status, s.state])).toEqual([
      ['pending_payment', 'done'],
      ['paid', 'current'],
      ['fulfilling', 'upcoming'],
      ['shipped', 'upcoming'],
      ['delivered', 'upcoming'],
    ])
  })

  it('ends at a cancellation or refund, with nothing upcoming', () => {
    const steps = timeline('refunded', [
      { from_status: null, to_status: 'pending_payment', at: at(1) },
      { from_status: 'pending_payment', to_status: 'paid', at: at(2) },
      { from_status: 'paid', to_status: 'refunded', at: at(9) },
    ])
    expect(steps.map((s) => s.status)).toEqual(['pending_payment', 'paid', 'refunded'])
    expect(steps.at(-1)?.state).toBe('current')
  })
})
