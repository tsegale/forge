import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { signedInAsAdmin } from '@/test/auth'
import { nad } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

const metrics = (days: number) => ({
  days,
  revenue: nad(1_500_000),
  orders: 3,
  average_order: nad(500_000),
  units: 7,
  refunded: nad(0),
  awaiting_payment: 1,
  daily: Array.from({ length: days }, (_, i) => ({
    day: `2026-09-${String(i + 1).padStart(2, '0')}`,
    revenue: nad(i === days - 1 ? 1_500_000 : 0),
    orders: i === days - 1 ? 3 : 0,
  })),
  by_status: [
    { status: 'paid', count: 2 },
    { status: 'shipped', count: 1 },
  ],
  low_stock: [{ product_id: 4, sku: 'FRG-CPU-R7-9800X3D', name: 'AMD Ryzen 7 9800X3D', available: 2 }],
  top_products: [
    {
      product_id: 1,
      sku: 'FRG-CPU-R7-7800X3D',
      name: 'AMD Ryzen 7 7800X3D',
      units: 2,
      revenue: nad(1_599_800),
    },
  ],
})

const requested: number[] = []

beforeEach(() => {
  requested.length = 0
  server.use(
    ...signedInAsAdmin(),
    http.get('/api/v1/admin/metrics', ({ request }) => {
      const days = Number(new URL(request.url).searchParams.get('days'))
      requested.push(days)
      return HttpResponse.json(metrics(days))
    }),
  )
})

describe('admin dashboard', () => {
  it('is where the back office opens, with KPIs, a chart and what needs attention', async () => {
    const router = renderApp('/admin')
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/admin/dashboard')
    })
    expect((await screen.findByText('Revenue')).nextElementSibling).toHaveTextContent('N$ 15,000.00')
    expect(screen.getByRole('img', { name: 'Revenue per day, last 30 days' })).toHaveAccessibleDescription(
      'N$ 15,000.00 from 3 orders over 30 days.',
    )
    const low = screen.getByRole('region', { name: 'Low stock' })
    expect(within(low).getByText('AMD Ryzen 7 9800X3D')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Best sellers' })).toHaveTextContent('AMD Ryzen 7 7800X3D')
    await userEvent.click(screen.getByRole('button', { name: '7 days' }))
    await waitFor(() => {
      expect(requested).toContain(7)
    })
  })
})

describe('audit log', () => {
  it('lists every kind of entry and filters to one', async () => {
    const kinds: (string | null)[] = []
    server.use(
      http.get('/api/v1/admin/audit', ({ request }) => {
        const kind = new URL(request.url).searchParams.get('kind')
        kinds.push(kind)
        return HttpResponse.json({
          items: [
            {
              kind: 'stock',
              at: '2026-10-06T10:00:00Z',
              subject: 'FRG-CPU-R7-7800X3D',
              summary: 'On hand 25 to 30',
              actor: 'Dana Admin',
              details: {},
            },
          ],
          next_before: null,
        })
      }),
    )
    renderApp('/admin/audit')
    const row = await screen.findByRole('row', { name: /On hand 25 to 30/ })
    expect(row).toHaveTextContent('Dana Admin')
    await userEvent.click(screen.getByRole('button', { name: 'Stock' }))
    await waitFor(() => {
      expect(kinds.at(-1)).toBe('stock')
    })
  })
})

describe('webhooks', () => {
  it('links each event to its order', async () => {
    server.use(
      http.get('/api/v1/admin/webhooks', () =>
        HttpResponse.json({
          items: [
            {
              provider: 'stripe',
              event_id: 'evt_123',
              event_type: 'payment_intent.succeeded',
              processed_at: '2026-10-06T10:00:00Z',
              order_number: 'FRG-000042',
            },
          ],
          next_before: null,
        }),
      ),
    )
    renderApp('/admin/webhooks')
    expect(await screen.findByRole('link', { name: 'FRG-000042' })).toHaveAttribute(
      'href',
      '/admin/orders/FRG-000042',
    )
    expect(screen.getByText('payment_intent.succeeded')).toBeInTheDocument()
  })
})
