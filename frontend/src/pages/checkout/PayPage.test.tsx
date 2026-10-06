import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signedIn } from '@/test/auth'
import { apiError, cartWith, order, storeConfig } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

const confirmPayment = vi.fn()

// Stripe's iframe cannot run in jsdom; the real Payment Element is covered by Playwright.
vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: ReactNode }) => children,
  PaymentElement: () => <div data-testid="payment-element" />,
  useStripe: () => ({ confirmPayment }),
  useElements: () => ({}),
}))

const ORDER = '/api/v1/orders/FRG-000042'
const expired = () => new Date(Date.now() - 1000).toISOString()

beforeEach(() => {
  confirmPayment.mockReset()
  server.use(
    ...signedIn(),
    http.get('/api/v1/config', () => HttpResponse.json(storeConfig)),
    http.get('/api/v1/cart', () => HttpResponse.json(cartWith(1))),
    http.post(`${ORDER}/payment`, () =>
      HttpResponse.json({ client_secret: 'pi_1_secret_2', status: 'requires_payment_method' }),
    ),
  )
})

describe('PayPage', () => {
  it('lets a customer retry after a decline, then waits for the webhook to mark it paid', async () => {
    let paid = false
    server.use(http.get(ORDER, () => HttpResponse.json(order(paid ? { status: 'paid' } : {}))))
    confirmPayment
      .mockResolvedValueOnce({
        error: { type: 'card_error', code: 'card_declined', message: 'Your card was declined.' },
      })
      .mockImplementationOnce(() => {
        paid = true // the webhook lands while the page polls
        return Promise.resolve({ paymentIntent: { status: 'succeeded' } })
      })

    const router = renderApp('/orders/FRG-000042/pay')
    expect(await screen.findByRole('timer', { name: 'Time left to pay' })).toHaveTextContent(
      /^(10:0[01]|9:5\d)$/,
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Pay N$ 8,149.00' }))

    expect(await screen.findByText('Your card was declined')).toBeInTheDocument()
    expect(screen.getByText(/Check the details or try a different card/)).toBeInTheDocument()
    expect(screen.getByTestId('payment-element')).toBeInTheDocument() // still there to try again

    await userEvent.click(screen.getByRole('button', { name: 'Pay N$ 8,149.00' }))
    expect(await screen.findByText('Confirming your payment')).toBeInTheDocument()
    await waitFor(
      () => {
        expect(router.state.location.pathname).toBe('/orders/FRG-000042/confirmation')
      },
      { timeout: 5000 },
    )
    expect(confirmPayment).toHaveBeenCalledTimes(2)
  })

  it('offers a fresh checkout when the reservation has expired, refilling the cart', async () => {
    const calls: string[] = []
    server.use(
      http.get(ORDER, () => HttpResponse.json(order({ reservation_expires_at: expired() }))),
      http.post(`${ORDER}/cancel`, () => {
        calls.push('cancel')
        return HttpResponse.json(order({ status: 'cancelled' }))
      }),
      http.post(`${ORDER}/reorder`, () => {
        calls.push('reorder')
        return HttpResponse.json({ ...cartWith(1), unavailable_product_ids: [7] })
      }),
    )
    const router = renderApp('/orders/FRG-000042/pay')
    expect(await screen.findByRole('heading', { name: 'Your reservation has expired' })).toBeInTheDocument()
    expect(screen.queryByTestId('payment-element')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Start a fresh checkout' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/cart')
    })
    expect(calls).toEqual(['cancel', 'reorder'])
    expect(
      await screen.findByText('One part from your previous order is no longer sold.'),
    ).toBeInTheDocument()
  })

  it('sends an expired build order back to checkout with the same build', async () => {
    server.use(
      http.get(ORDER, () =>
        HttpResponse.json(order({ status: 'cancelled', build_id: 9, reservation_expires_at: expired() })),
      ),
      http.get('/api/v1/addresses', () => HttpResponse.json({ items: [] })),
      http.get('/api/v1/builds/9', () => HttpResponse.json({ error: 'not needed' }, { status: 500 })),
    )
    const router = renderApp('/orders/FRG-000042/pay')
    await userEvent.click(await screen.findByRole('button', { name: 'Start a fresh checkout' }))
    await waitFor(() => {
      expect(router.state.location.pathname + router.state.location.search).toBe('/checkout?build=9')
    })
  })

  it('keeps the reservation and offers a retry when payment cannot start', async () => {
    let attempts = 0
    server.use(
      http.get(ORDER, () => HttpResponse.json(order())),
      // Fails twice (the first try and the one automatic retry on 5xx), then recovers.
      http.post(`${ORDER}/payment`, () =>
        attempts++ < 2
          ? HttpResponse.json(apiError('payment_unavailable', 'Payments are temporarily unavailable.'), {
              status: 503,
            })
          : HttpResponse.json({ client_secret: 'pi_1_secret_2', status: 'requires_payment_method' }),
      ),
    )
    renderApp('/orders/FRG-000042/pay')
    expect(
      await screen.findByText(
        'Payment could not be started. Your parts are still reserved.',
        {},
        { timeout: 4000 },
      ),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByTestId('payment-element')).toBeInTheDocument()
    expect(attempts).toBe(3)
  })
})

describe('PayPage with simulated payments', () => {
  it('pays through the test form, with a decline first', async () => {
    const outcomes: unknown[] = []
    let paid = false
    server.use(
      http.get('/api/v1/config', () => HttpResponse.json({ ...storeConfig, payment_provider: 'fake' })),
      http.get(ORDER, () => HttpResponse.json(order(paid ? { status: 'paid' } : {}))),
      http.post('/api/test/payments/FRG-000042', async ({ request }) => {
        const body = (await request.json()) as { outcome: string }
        outcomes.push(body.outcome)
        if (body.outcome === 'declined') {
          return HttpResponse.json({ status: 'declined', message: 'Your card was declined.' })
        }
        paid = true
        return HttpResponse.json({ status: 'succeeded' })
      }),
    )
    const router = renderApp('/orders/FRG-000042/pay')
    expect(await screen.findByText(/Test mode: this store uses simulated payments/)).toBeInTheDocument()
    expect(screen.queryByTestId('payment-element')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Simulate a declined card' }))
    expect(await screen.findByText('Your card was declined')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Pay N$ 8,149.00' }))
    await waitFor(
      () => {
        expect(router.state.location.pathname).toBe('/orders/FRG-000042/confirmation')
      },
      { timeout: 5000 },
    )
    expect(outcomes).toEqual(['declined', 'succeeded'])
  })
})
