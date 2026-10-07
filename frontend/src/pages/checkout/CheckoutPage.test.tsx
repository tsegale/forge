import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { signedIn } from '@/test/auth'
import { apiError, cartWith, cpu, nad, order, storeConfig } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

const savedAddress = {
  id: 4,
  type: 'shipping',
  recipient_name: 'Ada Lovelace',
  phone: null,
  line1: '12 Independence Avenue',
  line2: null,
  city: 'Windhoek',
  region: null,
  postal_code: null,
  country_code: 'NA',
  is_default: true,
}

let checkoutBody: unknown = null

beforeEach(() => {
  checkoutBody = null
  server.use(
    ...signedIn(),
    http.get('/api/v1/config', () => HttpResponse.json(storeConfig)),
    http.get('/api/v1/cart', () => HttpResponse.json(cartWith(1))),
    http.get('/api/v1/orders/FRG-000042', () => HttpResponse.json(order())),
    http.post('/api/v1/orders/FRG-000042/payment', () =>
      HttpResponse.json({ client_secret: 'pi_1_secret_2', status: 'requires_payment_method' }),
    ),
  )
})

describe('CheckoutPage', () => {
  it('checks out the cart to the default saved address and goes to payment', async () => {
    server.use(
      http.get('/api/v1/addresses', () => HttpResponse.json({ items: [savedAddress] })),
      http.post('/api/v1/checkout', async ({ request }) => {
        checkoutBody = await request.json()
        return HttpResponse.json({ ...order(), payment: null }, { status: 201 })
      }),
    )
    const router = renderApp('/checkout')
    expect(await screen.findByRole('radio', { name: /Ada Lovelace/ })).toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: 'Continue to review' }))
    const review = await screen.findByRole('heading', { name: 'Review and reserve' })
    expect(review).toHaveFocus()
    expect(screen.getByText('Deliver to Ada Lovelace')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?step=review')
    await userEvent.click(screen.getByRole('button', { name: 'Place order and pay' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/orders/FRG-000042/pay')
    })
    expect(checkoutBody).toEqual({ source: 'cart', address_id: 4, address: null })
  })

  it('checks out a build with a one-off address and shows field errors in place', async () => {
    let attempts = 0
    server.use(
      http.get('/api/v1/addresses', () => HttpResponse.json({ items: [] })),
      http.get('/api/v1/builds/9', () =>
        HttpResponse.json({
          id: 9,
          name: 'Demo gaming rig',
          status: 'validated',
          item_count: 1,
          subtotal: nad(799_900),
          updated_at: '2026-10-02T09:00:00Z',
          items: [{ id: 90, quantity: 1, line_total: nad(799_900), product: cpu() }],
        }),
      ),
      http.post('/api/v1/checkout', async ({ request }) => {
        attempts += 1
        checkoutBody = await request.json()
        return attempts === 1
          ? HttpResponse.json(
              apiError('validation_error', 'The request is invalid.', [
                { field: 'address.city', message: 'Enter a city.', type: 'string_too_short' },
              ]),
              { status: 422 },
            )
          : HttpResponse.json({ ...order({ build_id: 9 }), payment: null }, { status: 201 })
      }),
    )
    const router = renderApp('/checkout?build=9')
    expect(await screen.findByText('Build: Demo gaming rig')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Street address'), '5 Robert Mugabe Avenue')
    await userEvent.click(screen.getByLabelText('Save this address for next time')) // one-off
    await userEvent.click(screen.getByRole('button', { name: 'Continue to review' }))

    // Checked before review: the city is required.
    expect(await screen.findByText('Enter a city or town.')).toBeInTheDocument()
    expect(screen.getByLabelText('City or town')).toHaveFocus()
    await userEvent.type(screen.getByLabelText('City or town'), 'Windhoek')
    await userEvent.click(screen.getByRole('button', { name: 'Continue to review' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Place order and pay' }))

    // The API's own field errors send the customer back to the form, next to the field.
    expect(await screen.findByText('Enter a city.')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?build=9')
    expect(checkoutBody).toMatchObject({
      source: { build_id: 9 },
      address_id: null,
      address: {
        recipient_name: 'Ada L',
        line1: '5 Robert Mugabe Avenue',
        city: 'Windhoek',
        country_code: 'NA',
      },
    })

    await userEvent.click(screen.getByRole('button', { name: 'Continue to review' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Place order and pay' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/orders/FRG-000042/pay')
    })
  })

  it('names the lines that ran out of stock', async () => {
    server.use(
      http.get('/api/v1/addresses', () => HttpResponse.json({ items: [savedAddress] })),
      http.post('/api/v1/checkout', () =>
        HttpResponse.json(
          apiError('insufficient_stock', 'Some items are no longer available.', [
            { product_id: 1, requested: 1, available: 0 },
          ]),
          { status: 409 },
        ),
      ),
    )
    renderApp('/checkout?step=review')
    await userEvent.click(await screen.findByRole('button', { name: 'Place order and pay' }))
    expect(await screen.findByText('Only 0 available, you asked for 1.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Update your cart' })).toHaveAttribute('href', '/cart')
  })
})
