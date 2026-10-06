import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDraft } from '@/builds/store'
import { signedOut } from '@/test/auth'
import { cpu, nad, psu } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

const featured = {
  id: 3,
  name: '1440p gaming',
  status: 'validated',
  item_count: 2,
  subtotal: nad(989_800),
  updated_at: '2026-10-06T00:00:00Z',
  items: [
    { id: 1, quantity: 1, line_total: nad(799_900), product: cpu() },
    { id: 2, quantity: 1, line_total: nad(189_900), product: psu() },
  ],
  blurb: 'High refresh 1440p on a mid tower.',
  share_slug: 'featured-1440p-gaming',
  compatible: true,
}

beforeEach(() => {
  server.use(
    signedOut(),
    http.get('/api/v1/builds/featured', () => HttpResponse.json({ items: [featured] })),
    http.get('/api/v1/products/price-drops', () =>
      HttpResponse.json({
        items: [
          {
            product: cpu(),
            was: nad(899_900),
            saving_cents: 100_000,
            percent_off: 11,
            dropped_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
          },
        ],
      }),
    ),
    http.post('/api/v1/compatibility/check', () =>
      HttpResponse.json({
        compatible: true,
        complete: true,
        conflicts: [],
        warnings: [],
        missing_kinds: [],
        power: { sustained_w: 300, peak_w: 400, recommended_psu_w: 550 },
      }),
    ),
    http.get('/api/v1/products', () => HttpResponse.json({ items: [], next_cursor: null })),
  )
})

describe('HomePage', () => {
  it('leads with the promise and the two ways in', async () => {
    renderApp('/')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Build a PC that works the first time.' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Start a build' })).toHaveAttribute('href', '/configurator')
    expect(screen.getByRole('link', { name: 'Shop components' })).toHaveAttribute('href', '/shop')
    expect(document.title).toBe('Forge')
  })

  it('shows a price drop with the old price and how recent it is', async () => {
    renderApp('/')
    const drops = await screen.findByRole('region', { name: 'Price drops' })
    expect(await within(drops).findByText('11% off, 3 days ago')).toBeInTheDocument()
    expect(within(drops).getByText('N$ 8,999.00')).toBeInTheDocument()
  })

  it('opens a featured build in the configurator as a draft', async () => {
    const router = renderApp('/')
    await userEvent.click(
      await screen.findByRole('button', { name: 'Open 1440p gaming in the configurator' }),
    )
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/configurator')
    })
    expect(getDraft().name).toBe('1440p gaming')
    expect(getDraft().items.map((item) => item.product.id)).toEqual([1, 6])
  })

  it('hides empty collections', async () => {
    server.use(http.get('/api/v1/products/price-drops', () => HttpResponse.json({ items: [] })))
    renderApp('/')
    await screen.findByRole('heading', { name: 'Start from a validated build' })
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Price drops' })).toBeNull()
    })
    expect(screen.queryByRole('region', { name: 'Back in stock' })).toBeNull()
  })
})
