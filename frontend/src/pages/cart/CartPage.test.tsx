import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { signedIn, signedOut } from '@/test/auth'
import { cartWith, cpu, emptyCart, nad, storeConfig } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

beforeEach(() => {
  server.use(
    signedOut(),
    http.get('/api/v1/config', () => HttpResponse.json(storeConfig)),
  )
})

describe('CartPage', () => {
  it('shows lines, totals and the free shipping gap, and updates quantities', async () => {
    let patched: unknown = null
    server.use(
      http.get('/api/v1/cart', () => HttpResponse.json(cartWith(1, { line_total: nad(299_900) }))),
      http.patch('/api/v1/cart/items/31', async ({ request }) => {
        patched = await request.json()
        return HttpResponse.json(cartWith(2))
      }),
    )
    renderApp('/cart')
    const main = await screen.findByRole('main')
    expect(await within(main).findByRole('link', { name: 'AMD Ryzen 7 7800X3D' })).toBeInTheDocument()
    expect(screen.getByText('Total').nextSibling).toHaveTextContent('N$ 8,149.00')
    expect(
      within(screen.getByRole('complementary', { name: 'Order summary' })).getByText('N$ 2,001.00')
        .parentElement,
    ).toHaveTextContent('Add N$ 2,001.00 for free delivery.')

    await userEvent.click(screen.getByRole('button', { name: 'Increase quantity' }))
    expect(patched).toEqual({ quantity: 2, saved_for_later: null })
    expect(await screen.findByText('N$ 15,998.00')).toBeInTheDocument()
  })

  it('sends a guest to sign in before checkout, and back', async () => {
    server.use(http.get('/api/v1/cart', () => HttpResponse.json(cartWith(1))))
    renderApp('/cart')
    expect(await screen.findByRole('link', { name: 'Sign in to check out' })).toHaveAttribute(
      'href',
      '/login?next=%2Fcheckout',
    )
  })

  it('blocks checkout while a line exceeds the stock', async () => {
    server.use(
      ...signedIn(),
      http.get('/api/v1/cart', () =>
        HttpResponse.json(
          cartWith(3, {
            in_stock: false,
            product: cpu({ availability: { in_stock: true, quantity_available: 2 } }),
          }),
        ),
      ),
    )
    renderApp('/cart')
    expect(await screen.findByText(/Only 2 available/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Check out' })).toBeDisabled()
  })

  it("waits for the session to restore, so a reload shows the user's cart, not a guest's", async () => {
    server.use(
      ...signedIn(),
      http.get('/api/v1/cart', ({ request }) =>
        HttpResponse.json(request.headers.has('Authorization') ? cartWith(1) : emptyCart),
      ),
    )
    renderApp('/cart')
    const main = await screen.findByRole('main')
    expect(await within(main).findByRole('link', { name: 'AMD Ryzen 7 7800X3D' })).toBeInTheDocument()
    expect(screen.queryByText('Your cart is empty')).not.toBeInTheDocument()
  })

  it('has a helpful empty state', async () => {
    server.use(http.get('/api/v1/cart', () => HttpResponse.json(emptyCart)))
    renderApp('/cart')
    expect(await screen.findByRole('heading', { name: 'Your cart is empty' })).toBeInTheDocument()
  })

  it('saves a line for later and moves it back, outside the order', async () => {
    const line = cartWith(1).items[0]
    if (!line) throw new Error('fixture')
    let body: unknown = null
    server.use(
      http.get('/api/v1/cart', () => HttpResponse.json(cartWith(1))),
      http.patch('/api/v1/cart/items/31', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ ...emptyCart, saved: [line] })
      }),
    )
    renderApp('/cart')
    await userEvent.click(await screen.findByRole('button', { name: 'Save for later: AMD Ryzen 7 7800X3D' }))
    expect(body).toEqual({ quantity: null, saved_for_later: true })
    expect(await screen.findByRole('heading', { name: 'Your cart is empty' })).toBeInTheDocument()
    const saved = screen.getByRole('region', { name: /Saved for later/ })
    expect(within(saved).getByRole('link', { name: 'AMD Ryzen 7 7800X3D' })).toBeInTheDocument()
    expect(
      within(saved).getByRole('button', { name: 'Move to cart: AMD Ryzen 7 7800X3D' }),
    ).toBeInTheDocument()
  })

  it('offers to undo a removal', async () => {
    let readded: unknown = null
    server.use(
      http.get('/api/v1/cart', () => HttpResponse.json(cartWith(2))),
      http.delete('/api/v1/cart/items/31', () => HttpResponse.json(emptyCart)),
      http.post('/api/v1/cart/items', async ({ request }) => {
        readded = await request.json()
        return HttpResponse.json(cartWith(2), { status: 201 })
      }),
    )
    renderApp('/cart')
    await userEvent.click(await screen.findByRole('button', { name: 'Remove AMD Ryzen 7 7800X3D' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(readded).toEqual({ product_id: 1, quantity: 2 })
    expect(await screen.findByRole('list', { name: 'Cart lines' })).toBeInTheDocument()
  })
})
