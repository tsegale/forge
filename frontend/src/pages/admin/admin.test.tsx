import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { signedIn, signedInAsAdmin } from '@/test/auth'
import { apiError, cartWith, kinds, nad, order, storeConfig } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

const row = (order_number: string, status: string, next_steps: string[], refundable: boolean) => ({
  order_number,
  status,
  item_count: 1,
  total: nad(814_900),
  created_at: '2026-10-06T09:00:00Z',
  customer_email: 'demo-customer@example.com',
  next_steps,
  refundable,
})

const product = {
  id: 43,
  sku: 'FRG-PSU-SS-GX750',
  name: 'Seasonic FOCUS GX-750 ATX 3',
  kind_code: 'psu',
  price_cents: 229_900,
  is_active: true,
  quantity_on_hand: 20,
  quantity_reserved: 2,
  quantity_available: 18,
  version: 5,
}

beforeEach(() => {
  server.use(
    ...signedInAsAdmin(),
    http.get('/api/v1/config', () => HttpResponse.json(storeConfig)),
    http.get('/api/v1/cart', () => HttpResponse.json(cartWith(1))),
    http.get('/api/v1/component-kinds', () => HttpResponse.json(kinds)),
  )
})

describe('admin orders', () => {
  it('offers only the legal next steps and applies one', async () => {
    let posted: unknown = null
    let advanced = false
    server.use(
      http.get('/api/v1/admin/orders', () =>
        HttpResponse.json({
          items: [
            row(
              'FRG-000006',
              advanced ? 'fulfilling' : 'paid',
              advanced ? ['shipped'] : ['fulfilling'],
              true,
            ),
            row('FRG-000004', 'shipped', ['delivered'], false),
            row('FRG-000009', 'pending_payment', [], false),
          ],
          next_cursor: null,
        }),
      ),
      http.post('/api/v1/admin/orders/FRG-000006/status', async ({ request }) => {
        posted = await request.json()
        advanced = true
        return HttpResponse.json({
          ...order({ order_number: 'FRG-000006', status: 'fulfilling' }),
          customer_email: 'demo-customer@example.com',
          next_steps: ['shipped'],
          refundable: true,
        })
      }),
    )
    renderApp('/admin/orders')
    const table = await screen.findByRole('table')
    const shipped = within(table).getByRole('row', { name: /FRG-000004/ })
    expect(within(shipped).getByRole('button', { name: 'Mark delivered for FRG-000004' })).toBeInTheDocument()
    expect(within(shipped).queryByRole('button', { name: /Refund/ })).not.toBeInTheDocument()
    const unpaid = within(table).getByRole('row', { name: /FRG-000009/ })
    expect(within(unpaid).queryAllByRole('button')).toHaveLength(0)

    await userEvent.click(within(table).getByRole('button', { name: 'Start fulfilment for FRG-000006' }))
    expect(posted).toEqual({ to: 'fulfilling' })
    expect(
      await within(table).findByRole('button', { name: 'Mark shipped for FRG-000006' }),
    ).toBeInTheDocument()
  })

  it('refunds only after confirmation, with the reason', async () => {
    let refundBody: unknown = null
    server.use(
      http.get('/api/v1/admin/orders', () =>
        HttpResponse.json({ items: [row('FRG-000006', 'paid', ['fulfilling'], true)], next_cursor: null }),
      ),
      http.post('/api/v1/admin/orders/FRG-000006/refund', async ({ request }) => {
        refundBody = await request.json()
        return HttpResponse.json({
          ...order({ order_number: 'FRG-000006', status: 'refunded' }),
          customer_email: 'demo-customer@example.com',
          next_steps: [],
          refundable: false,
        })
      }),
    )
    renderApp('/admin/orders')
    await userEvent.click(await screen.findByRole('button', { name: 'Refund FRG-000006' }))
    const dialog = await screen.findByRole('dialog', { name: 'Refund order FRG-000006?' })
    expect(dialog).toHaveTextContent("N$ 8,149.00 goes back to demo-customer@example.com's card")
    expect(refundBody).toBeNull()

    await userEvent.type(within(dialog).getByLabelText(/Reason/), 'Customer changed their mind')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Refund N$ 8,149.00' }))
    await waitFor(() => {
      expect(refundBody).toEqual({ reason: 'Customer changed their mind' })
    })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('is closed to customers', async () => {
    server.use(...signedIn())
    renderApp('/admin/orders')
    expect(await screen.findByRole('heading', { name: 'Not available' })).toBeInTheDocument()
  })
})

describe('admin inventory', () => {
  it('shows "stock changed, reload" on a 412, then saves against the new version', async () => {
    const ifMatch: (string | null)[] = []
    server.use(
      http.get('/api/v1/admin/products', () => HttpResponse.json({ items: [product], next_cursor: null })),
      http.patch('/api/v1/admin/inventory/43', ({ request }) => {
        ifMatch.push(request.headers.get('If-Match'))
        return ifMatch.length === 1
          ? HttpResponse.json(
              apiError('precondition_failed', 'The resource has changed since you last read it.'),
              {
                status: 412,
              },
            )
          : HttpResponse.json({
              product_id: 43,
              quantity_on_hand: 30,
              quantity_reserved: 4,
              quantity_available: 26,
              version: 7,
              updated_at: '2026-10-06T10:00:00Z',
            })
      }),
      http.get('/api/v1/admin/inventory/43', () =>
        HttpResponse.json({
          product_id: 43,
          quantity_on_hand: 21,
          quantity_reserved: 4,
          quantity_available: 17,
          version: 6,
          updated_at: '2026-10-06T09:59:00Z',
        }),
      ),
    )
    renderApp('/admin/inventory')
    await userEvent.click(await screen.findByRole('button', { name: `Edit stock for ${product.name}` }))
    const dialog = await screen.findByRole('dialog')
    const input = within(dialog).getByLabelText('New stock on hand')
    await userEvent.clear(input)
    await userEvent.type(input, '25')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save stock' }))

    expect(await within(dialog).findByText('Stock changed, reload')).toBeInTheDocument()
    expect(dialog).toHaveTextContent('It now has 21 on hand, 4 reserved by checkouts.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reload and edit again' }))
    expect(within(dialog).getByLabelText('New stock on hand')).toHaveValue('21')

    await userEvent.clear(within(dialog).getByLabelText('New stock on hand'))
    await userEvent.type(within(dialog).getByLabelText('New stock on hand'), '30')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save stock' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(ifMatch).toEqual(['"5"', '"6"'])
  })

  it('will not set stock below what checkouts have reserved', async () => {
    server.use(
      http.get('/api/v1/admin/products', () => HttpResponse.json({ items: [product], next_cursor: null })),
    )
    renderApp('/admin/inventory')
    await userEvent.click(await screen.findByRole('button', { name: `Edit stock for ${product.name}` }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.clear(within(dialog).getByLabelText('New stock on hand'))
    await userEvent.type(within(dialog).getByLabelText('New stock on hand'), '1')
    expect(within(dialog).getByText(/At least 2: that many are reserved/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Save stock' })).toBeDisabled()
  })

  it('sends only a changed price, in integer cents', async () => {
    let body: unknown = null
    server.use(
      http.get('/api/v1/admin/products', () => HttpResponse.json({ items: [product], next_cursor: null })),
      http.patch('/api/v1/admin/products/43', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ ...product, price_cents: 219_950, updated_at: '2026-10-06T10:00:00Z' })
      }),
    )
    renderApp('/admin/inventory')
    await userEvent.click(
      await screen.findByRole('button', { name: `Edit price and availability for ${product.name}` }),
    )
    const dialog = await screen.findByRole('dialog')
    const price = within(dialog).getByLabelText('Price in N$ (VAT included)')
    expect(price).toHaveValue('2299.00')
    await userEvent.clear(price)
    await userEvent.type(price, '2,199.5')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save product' }))
    await waitFor(() => {
      expect(body).toEqual({ price_cents: 219_950 })
    })
  })
})
