import { describe, expect, it } from 'vitest'
import { formatCents, formatPrice } from './money'

describe('formatCents', () => {
  it.each([
    [0, 'N$ 0.00'],
    [5, 'N$ 0.05'],
    [100, 'N$ 1.00'],
    [123_456, 'N$ 1,234.56'],
    [429_990_000, 'N$ 4,299,900.00'],
    [-1_500, '-N$ 15.00'],
  ])('%i cents is %s', (cents, expected) => {
    expect(formatCents(cents)).toBe(expected)
  })

  it('formats other currencies with the code after the amount', () => {
    expect(formatCents(1_999, 'usd')).toBe('19.99 USD')
  })

  it('refuses fractional cents rather than rounding silently', () => {
    expect(() => formatCents(10.5)).toThrow(/integer cents/)
  })

  it('formats a Price from the API', () => {
    expect(formatPrice({ amount_cents: 214_904, currency: 'nad' })).toBe('N$ 2,149.04')
  })
})
