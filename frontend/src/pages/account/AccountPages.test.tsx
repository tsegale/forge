import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { signedIn, signedOut } from '@/test/auth'
import { apiError, cpu, customer, nad } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

const address = {
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

const alert = {
  id: 9,
  product: cpu(),
  target: nad(699_900),
  triggered_at: null,
  created_at: '2026-10-01T00:00:00Z',
}

beforeEach(() => {
  server.use(
    ...signedIn(),
    http.get('/api/v1/orders', () => HttpResponse.json({ items: [], next_cursor: null })),
    http.get('/api/v1/builds', () => HttpResponse.json({ items: [] })),
    http.get('/api/v1/alerts', () => HttpResponse.json({ items: [alert] })),
    http.get('/api/v1/addresses', () => HttpResponse.json({ items: [address] })),
  )
})

describe('account', () => {
  it('greets the customer and links every section', async () => {
    renderApp('/account')
    expect(await screen.findByRole('heading', { level: 1, name: 'Hello, Ada' })).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Account' })
    expect(within(nav).getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page')
    for (const name of ['Orders', 'Saved builds', 'Addresses', 'Price alerts', 'Profile and security']) {
      expect(within(nav).getByRole('link', { name })).toBeInTheDocument()
    }
    expect(await screen.findByText('No orders yet.')).toBeInTheDocument()
  })

  it('sends a guest to sign in', async () => {
    server.use(signedOut())
    const router = renderApp('/account/addresses')
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login')
    })
  })
})

describe('addresses', () => {
  it('adds an address and can delete one after confirming', async () => {
    let created: unknown = null
    let deleted = false
    server.use(
      http.post('/api/v1/addresses', async ({ request }) => {
        created = await request.json()
        return HttpResponse.json({ ...address, id: 5, is_default: false }, { status: 201 })
      }),
      http.delete('/api/v1/addresses/4', () => {
        deleted = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderApp('/account/addresses')
    await userEvent.click(await screen.findByRole('button', { name: 'Add an address' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add an address' })
    await userEvent.type(within(dialog).getByLabelText('Street address'), '5 Robert Mugabe Avenue')
    await userEvent.type(within(dialog).getByLabelText('City or town'), 'Windhoek')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add address' }))
    await waitFor(() => {
      expect(created).toMatchObject({
        line1: '5 Robert Mugabe Avenue',
        city: 'Windhoek',
        type: 'shipping',
        is_default: false,
      })
    })

    await userEvent.click(screen.getByRole('button', { name: 'Delete the address 12 Independence Avenue' }))
    const confirm = await screen.findByRole('dialog', { name: 'Delete this address?' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete' }))
    await waitFor(() => {
      expect(deleted).toBe(true)
    })
  })
})

describe('price alerts', () => {
  it('lists what is being watched and stops watching', async () => {
    let stopped = false
    server.use(
      http.delete('/api/v1/alerts/9', () => {
        stopped = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderApp('/account/alerts')
    expect(await screen.findByRole('link', { name: 'AMD Ryzen 7 7800X3D' })).toBeInTheDocument()
    expect(screen.getByText('Watching')).toBeInTheDocument()
    expect(screen.getByText('N$ 6,999.00')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Stop watching AMD Ryzen 7 7800X3D' }))
    await waitFor(() => {
      expect(stopped).toBe(true)
    })
  })

  it('sets an alert from the product page, refusing a price at or above today', async () => {
    let body: unknown = null
    server.use(
      http.get('/api/v1/alerts', () => HttpResponse.json({ items: [] })),
      http.post('/api/v1/alerts', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(alert)
      }),
      http.get('/api/v1/products/:slug', () =>
        HttpResponse.json({
          ...cpu(),
          description: null,
          category: { id: 1, name: 'Processors', slug: 'processors' },
          images: [],
          rating: { average: null, count: 0 },
        }),
      ),
      http.get('/api/v1/products/:slug/price-history', () =>
        HttpResponse.json({
          currency: 'nad',
          days: 90,
          points: [],
          current_cents: 799_900,
          lowest_cents: 799_900,
          highest_cents: 799_900,
          change_cents: 0,
        }),
      ),
      http.get('/api/v1/products/:slug/reviews', () =>
        HttpResponse.json({ summary: { average: null, count: 0, counts: {} }, items: [], next_cursor: null }),
      ),
      http.get('/api/v1/products/:slug/reviews/mine', () => HttpResponse.json({ review: null })),
      http.get('/api/v1/products', () => HttpResponse.json({ items: [], next_cursor: null })),
    )
    renderApp('/products/amd-ryzen-7-7800x3d')
    await userEvent.click(await screen.findByRole('button', { name: 'Notify me when the price drops' }))
    const dialog = await screen.findByRole('dialog', { name: 'Price-drop alert' })
    const field = within(dialog).getByLabelText('Email me when the price is at or below (N$)')
    await userEvent.clear(field)
    await userEvent.type(field, '8000')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Set alert' }))
    expect(within(dialog).getByText(/Choose a price below today/)).toBeInTheDocument()
    await userEvent.clear(field)
    await userEvent.type(field, '6999')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Set alert' }))
    await waitFor(() => {
      expect(body).toEqual({ product_id: 1, target_price_cents: 699_900 })
    })
  })
})

describe('profile', () => {
  it('saves the name everywhere it is shown', async () => {
    server.use(
      http.patch('/api/v1/auth/me', async ({ request }) =>
        HttpResponse.json({ ...customer, ...((await request.json()) as object) }),
      ),
    )
    renderApp('/account/profile')
    const first = await screen.findByLabelText('First name')
    await userEvent.clear(first)
    await userEvent.type(first, 'Augusta')
    await userEvent.click(screen.getByRole('button', { name: 'Save name' }))
    expect(await screen.findByRole('button', { name: 'Account: Augusta' })).toBeInTheDocument()
  })

  it('says when the current password is wrong', async () => {
    server.use(
      http.post('/api/v1/auth/me/password', () =>
        HttpResponse.json(apiError('wrong_password', 'The current password is not correct.'), {
          status: 400,
        }),
      ),
    )
    renderApp('/account/profile')
    await userEvent.type(await screen.findByLabelText('Current password'), 'not it')
    await userEvent.type(screen.getByLabelText('New password'), 'a long new passphrase')
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByText('That is not your current password.')).toBeInTheDocument()
  })
})
