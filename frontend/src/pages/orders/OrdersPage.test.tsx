import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { signedIn } from '@/test/auth'
import { cartWith, nad, order, storeConfig } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

const summary = (order_number: string, status: string) => ({
  order_number,
  status,
  item_count: 1,
  total: nad(814_900),
  created_at: '2026-10-02T10:00:00Z',
})

const requests: URL[] = []

beforeEach(() => {
  requests.length = 0
  server.use(
    ...signedIn(),
    http.get('/api/v1/config', () => HttpResponse.json(storeConfig)),
    http.get('/api/v1/cart', () => HttpResponse.json(cartWith(1))),
    http.get('/api/v1/orders', ({ request }) => {
      const url = new URL(request.url)
      requests.push(url)
      if (url.searchParams.get('cursor') === '7') {
        return HttpResponse.json({ items: [summary('FRG-000001', 'delivered')], next_cursor: null })
      }
      return HttpResponse.json({
        items: [summary('FRG-000009', 'pending_payment'), summary('FRG-000008', 'shipped')],
        next_cursor: 7,
      })
    }),
  )
})

describe('OrdersPage', () => {
  it('lists orders with their status, pays a pending one, and pages back in time', async () => {
    renderApp('/orders')
    const table = await screen.findByRole('table')
    const pending = within(table).getByRole('row', { name: /FRG-000009/ })
    expect(within(pending).getByText('Awaiting payment')).toBeInTheDocument()
    expect(within(pending).getByRole('link', { name: 'Pay' })).toHaveAttribute(
      'href',
      '/orders/FRG-000009/pay',
    )
    expect(within(table).getByRole('row', { name: /FRG-000008/ })).toHaveTextContent('Shipped')

    await userEvent.click(screen.getByRole('button', { name: 'Show older orders' }))
    expect(await within(table).findByRole('row', { name: /FRG-000001/ })).toBeInTheDocument()
    expect(requests.at(-1)?.searchParams.get('cursor')).toBe('7')
  })

  it('filters by status through the URL', async () => {
    const router = renderApp('/orders')
    await screen.findByRole('table')
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'Shipped')
    await waitFor(() => {
      expect(requests.at(-1)?.searchParams.get('status')).toBe('shipped')
    })
    expect(router.state.location.search).toBe('?status=shipped')
  })

  it('buys an order again into the cart', async () => {
    server.use(
      http.post('/api/v1/orders/FRG-000008/reorder', () =>
        HttpResponse.json({ ...cartWith(1), unavailable_product_ids: [] }),
      ),
    )
    const router = renderApp('/orders')
    await userEvent.click(await screen.findByRole('button', { name: 'Buy order FRG-000008 again' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/cart')
    })
  })
})

describe('OrderPage', () => {
  it('shows the progress timeline, parts, totals and delivery address', async () => {
    server.use(
      http.get('/api/v1/orders/FRG-000042', () =>
        HttpResponse.json(
          order({
            status: 'shipped',
            payment_status: 'succeeded',
            history: [
              { from_status: null, to_status: 'pending_payment', at: '2026-10-02T10:00:00Z' },
              { from_status: 'pending_payment', to_status: 'paid', at: '2026-10-02T10:03:00Z' },
              { from_status: 'paid', to_status: 'fulfilling', at: '2026-10-03T08:00:00Z' },
              { from_status: 'fulfilling', to_status: 'shipped', at: '2026-10-03T15:00:00Z' },
            ],
          }),
        ),
      ),
    )
    renderApp('/orders/FRG-000042')
    const progress = await screen.findByRole('list', { name: 'Order progress' })
    const steps = within(progress).getAllByRole('listitem')
    expect(steps.map((step) => step.textContent)).toEqual([
      expect.stringContaining('Awaiting payment'),
      expect.stringContaining('Paid'),
      expect.stringContaining('Being prepared'),
      expect.stringContaining('Shipped'),
      'Delivered',
    ])
    expect(within(progress).getByText('Shipped').parentElement).toHaveAttribute('aria-current', 'step')
    expect(screen.getByText('Paid by card')).toBeInTheDocument()
    expect(screen.getByText(/12 Independence Avenue/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument()
  })

  it('cancels an unpaid order after confirmation', async () => {
    let cancelled = false
    server.use(
      http.get('/api/v1/orders/FRG-000042', () =>
        HttpResponse.json(order(cancelled ? { status: 'cancelled' } : {})),
      ),
      http.post('/api/v1/orders/FRG-000042/cancel', () => {
        cancelled = true
        return HttpResponse.json(order({ status: 'cancelled' }))
      }),
    )
    renderApp('/orders/FRG-000042')
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel order' }))
    const dialog = await screen.findByRole('dialog', { name: 'Cancel order FRG-000042?' })
    expect(cancelled).toBe(false) // nothing happens until confirmed
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel order' }))
    expect(await screen.findByRole('heading', { name: /Cancelled/ })).toBeInTheDocument()
    expect(cancelled).toBe(true)
  })
})
