import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { cpu, kinds } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

const requests: URL[] = []

beforeEach(() => {
  requests.length = 0
  server.use(
    http.post('/api/v1/auth/refresh', () =>
      HttpResponse.json(
        { error: { code: 'missing_refresh_token', message: 'x', details: null, request_id: null } },
        { status: 401 },
      ),
    ),
    http.get('/api/v1/component-kinds', () => HttpResponse.json(kinds)),
    http.get('/api/v1/products', ({ request }) => {
      const url = new URL(request.url)
      requests.push(url)
      if (url.searchParams.get('q') === 'nothing') return HttpResponse.json({ items: [], next_cursor: null })
      if (url.searchParams.get('cursor')) {
        return HttpResponse.json({
          items: [cpu({ id: 2, slug: 'amd-ryzen-7-9800x3d', name: 'AMD Ryzen 7 9800X3D' })],
          next_cursor: null,
        })
      }
      return HttpResponse.json({ items: [cpu()], next_cursor: 'c1' })
    }),
  )
})

describe('CatalogPage', () => {
  it('lists products with price and stock, and loads more pages by cursor', async () => {
    renderApp('/')
    const list = await screen.findByRole('region', { name: 'Products' })
    expect(await within(list).findByText('AMD Ryzen 7 7800X3D')).toBeInTheDocument()
    expect(within(list).getByText('N$ 7,999.00')).toBeInTheDocument()
    expect(within(list).getByText('In stock')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(await within(list).findByText('AMD Ryzen 7 9800X3D')).toBeInTheDocument()
    expect(requests.at(-1)?.searchParams.get('cursor')).toBe('c1')
  })

  it('debounces search into the URL and the query', async () => {
    const router = renderApp('/')
    await userEvent.type(await screen.findByRole('searchbox', { name: 'Search products' }), 'x3d')
    await waitFor(() => {
      expect(router.state.location.search).toBe('?q=x3d')
    })
    await waitFor(() => {
      expect(requests.at(-1)?.searchParams.get('q')).toBe('x3d')
    })
  })

  it('shows spec filters once a category is chosen', async () => {
    renderApp('/')
    expect(await screen.findByText('Choose a category to filter by specifications.')).toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: 'Processors' }))
    expect(await screen.findByLabelText('Socket')).toBeInTheDocument()
    expect(requests.at(-1)?.searchParams.get('kind')).toBe('cpu')
  })

  it('says so when nothing matches', async () => {
    renderApp('/?q=nothing')
    expect(
      await screen.findByText('No products match. Try fewer filters or a different search.'),
    ).toBeInTheDocument()
  })
})
