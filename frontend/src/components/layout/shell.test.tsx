import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { signedOut } from '@/test/auth'
import { cartWith, cpu } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

const suggestions = {
  query: 'x3d',
  total: 2,
  did_you_mean: null,
  groups: [
    {
      kind: 'cpu',
      total: 2,
      items: [
        cpu(),
        cpu({ id: 3, slug: 'amd-ryzen-7-9800x3d', name: 'AMD Ryzen 7 9800X3D', sku: 'FRG-CPU-R7-9800X3D' }),
      ],
    },
  ],
}

beforeEach(() => {
  server.use(signedOut())
})

function at<T>(items: T[], index: number): T {
  const item = items[index]
  if (item === undefined) throw new Error(`Expected an item at index ${String(index)}`)
  return item
}

/** The visible (desktop) search box; the phone row repeats it, hidden by CSS. */
const searchInput = () => at(screen.getAllByRole('combobox', { name: 'Search products' }), 0)

describe('header search', () => {
  it('suggests products grouped by kind, highlights the match, and opens one with the keyboard', async () => {
    server.use(http.get('/api/v1/search/suggest', () => HttpResponse.json(suggestions)))
    const router = renderApp('/')
    await userEvent.type(searchInput(), 'x3d')

    const listbox = await screen.findByRole('listbox', { name: 'Search suggestions' })
    expect(await within(listbox).findByRole('group', { name: /Processors/ })).toBeInTheDocument()
    const options = within(listbox).getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual([
      expect.stringContaining('Search for'),
      expect.stringContaining('AMD Ryzen 7 7800X3D'),
      expect.stringContaining('AMD Ryzen 7 9800X3D'),
    ])
    expect(within(at(options, 1)).getByText('X3D', { selector: 'mark' })).toBeInTheDocument()

    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    expect(searchInput()).toHaveAttribute('aria-activedescendant', at(options, 1).id)
    expect(options[1]).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{Enter}')
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/products/amd-ryzen-7-7800x3d')
    })
  })

  it('searches for the text on Enter and offers a correction for a typo', async () => {
    server.use(
      http.get('/api/v1/search/suggest', () =>
        HttpResponse.json({ query: 'vengance', total: 0, groups: [], did_you_mean: 'vengeance' }),
      ),
    )
    const router = renderApp('/')
    await userEvent.type(searchInput(), 'vengance')
    expect(await screen.findByRole('option', { name: /Did you mean .vengeance./ })).toBeInTheDocument()
    await userEvent.keyboard('{Enter}')
    await waitFor(() => {
      expect(router.state.location.pathname + router.state.location.search).toBe('/search?q=vengance')
    })
  })

  it('closes on Escape, then clears on a second Escape', async () => {
    server.use(http.get('/api/v1/search/suggest', () => HttpResponse.json(suggestions)))
    renderApp('/')
    await userEvent.type(searchInput(), 'x3d')
    await screen.findByRole('option', { name: /7800X3D/ })
    await userEvent.keyboard('{Escape}')
    expect(searchInput()).toHaveAttribute('aria-expanded', 'false')
    await userEvent.keyboard('{Escape}')
    expect(searchInput()).toHaveValue('')
  })
})

describe('mini-cart', () => {
  it('opens from the header with the lines, subtotal and free-delivery progress', async () => {
    server.use(http.get('/api/v1/cart', () => HttpResponse.json(cartWith(2))))
    renderApp('/')
    await userEvent.click(await screen.findByRole('button', { name: 'Cart, 2 items' }))
    const drawer = await screen.findByRole('dialog', { name: 'Your cart' })
    expect(within(drawer).getByRole('link', { name: 'AMD Ryzen 7 7800X3D' })).toBeInTheDocument()
    expect(within(drawer).getByText('2 x N$ 7,999.00')).toBeInTheDocument()
    expect(within(drawer).getByText('Free delivery on this order.')).toBeInTheDocument()
    expect(within(drawer).getByRole('link', { name: 'Check out' })).toHaveAttribute(
      'href',
      '/login?next=%2Fcheckout',
    )
  })
})

describe('announcement bar', () => {
  it('states the free-delivery threshold from the store settings', async () => {
    renderApp('/')
    const amount = await screen.findByText('N$ 5,000.00')
    expect(amount.parentElement).toHaveTextContent('Free delivery across Namibia on orders over N$ 5,000.00')
  })
})
