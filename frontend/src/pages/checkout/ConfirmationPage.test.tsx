import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { signedIn } from '@/test/auth'
import { order } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

const ORDER = '/api/v1/orders/FRG-000042'

beforeEach(() => {
  server.use(...signedIn())
})

describe('ConfirmationPage', () => {
  it('confirms a paid order with the receipt address, delivery and next steps', async () => {
    server.use(http.get(ORDER, () => HttpResponse.json(order({ status: 'paid' }))))
    renderApp('/orders/FRG-000042/confirmation')
    const heading = await screen.findByRole('heading', { level: 1, name: /Your order is confirmed/ })
    await waitFor(() => {
      expect(heading).toHaveFocus()
    })
    expect(screen.getByText('ada@example.com')).toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: 'Delivering to' })).getByText(/12 Independence Avenue/),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: 'What happens next' })).getAllByRole('listitem'),
    ).toHaveLength(3)
    expect(screen.getByRole('link', { name: 'View order' })).toHaveAttribute('href', '/orders/FRG-000042')
    const progress = screen.getByRole('navigation', { name: 'Checkout progress' })
    expect(progress.querySelector('[aria-current="step"]')).toHaveTextContent('Confirmation')
    expect(document.title).toBe('Order FRG-000042 confirmed | Forge')
  })

  it('sends an unpaid order to its order page instead', async () => {
    server.use(http.get(ORDER, () => HttpResponse.json(order())))
    const router = renderApp('/orders/FRG-000042/confirmation')
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/orders/FRG-000042')
    })
  })
})
