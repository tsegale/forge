import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PriceHistoryChart } from './PriceHistoryChart'

const now = new Date('2026-10-06T12:00:00Z')

describe('PriceHistoryChart', () => {
  it('draws a step line that holds each price until the next change', () => {
    const { container } = render(
      <PriceHistoryChart
        title="Price"
        now={now}
        currentCents={700_000}
        points={[
          { at: '2026-07-08T12:00:00Z', price_cents: 900_000 },
          { at: '2026-08-07T12:00:00Z', price_cents: 800_000 },
          { at: '2026-09-06T12:00:00Z', price_cents: 700_000 },
        ]}
      />,
    )
    const line = container.querySelector('path[fill="none"]')?.getAttribute('d') ?? ''
    // Move to the first point, then only horizontal and vertical segments, ending at today.
    expect(line).toMatch(/^M[\d.]+,[\d.]+(H[\d.]+V[\d.]+){2}H[\d.]+$/)
    expect(screen.getByRole('img', { name: 'Price' })).toHaveAccessibleDescription(
      'N$ 9,000.00 at the start, N$ 7,000.00 now. Lowest N$ 7,000.00 on 6 September 2026, highest N$ 9,000.00.',
    )
  })

  it('handles a price that never changed', () => {
    render(
      <PriceHistoryChart
        title="Flat"
        now={now}
        currentCents={500_000}
        points={[{ at: '2026-07-08T12:00:00Z', price_cents: 500_000 }]}
      />,
    )
    expect(screen.getByRole('img', { name: 'Flat' })).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(2)
  })
})
