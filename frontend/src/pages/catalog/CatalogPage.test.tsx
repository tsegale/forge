import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { setDraft } from '@/builds/store'
import { signedOut } from '@/test/auth'
import { cpu, facets, psu } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

const requests: URL[] = []
const facetRequests: URL[] = []

const incompatible = cpu({
  id: 9,
  slug: 'intel-core-i7-14700k',
  name: 'Intel Core i7-14700K',
  brand: { id: 2, name: 'Intel', slug: 'intel' },
  compatibility_warnings: [],
  compatibility: {
    compatible: false,
    conflicts: [
      {
        code: 'SOCKET_MISMATCH',
        severity: 'conflict',
        message: 'The CPU uses LGA1700 but the motherboard has an AM5 socket.',
        product_ids: [9, 20],
        details: { cpu_socket: 'LGA1700', board_socket: 'AM5' },
      },
    ],
    warnings: [],
  },
})

beforeEach(() => {
  requests.length = 0
  facetRequests.length = 0
  server.use(
    signedOut(),
    http.get('/api/v1/products/facets', ({ request }) => {
      const url = new URL(request.url)
      facetRequests.push(url)
      if (url.searchParams.get('q') === 'vengance')
        return HttpResponse.json(facets({ total: 0, kinds: [], brands: [], price: null }))
      return HttpResponse.json(
        facets({
          total: 2,
          incompatible: url.searchParams.get('compatible_with') ? 1 : null,
          kinds: [
            { kind: 'cpu', count: 2 },
            { kind: 'psu', count: 1 },
          ],
          brands: [
            { slug: 'amd', name: 'AMD', count: 1 },
            { slug: 'intel', name: 'Intel', count: 1 },
          ],
        }),
      )
    }),
    http.get('/api/v1/products', ({ request }) => {
      const url = new URL(request.url)
      requests.push(url)
      if (url.searchParams.get('q') === 'vengance') return HttpResponse.json({ items: [], next_cursor: null })
      if (url.searchParams.get('include_incompatible') === 'true') {
        return HttpResponse.json({ items: [cpu(), incompatible], next_cursor: null })
      }
      if (url.searchParams.get('cursor')) {
        return HttpResponse.json({
          items: [cpu({ id: 2, slug: 'amd-ryzen-7-9800x3d', name: 'AMD Ryzen 7 9800X3D' })],
          next_cursor: null,
        })
      }
      return HttpResponse.json({ items: [cpu()], next_cursor: 'c1' })
    }),
    http.get('/api/v1/search/suggest', ({ request }) =>
      HttpResponse.json({
        query: new URL(request.url).searchParams.get('q'),
        total: 0,
        groups: [],
        did_you_mean: 'vengeance',
      }),
    ),
  )
})

const results = () => screen.findByRole('region', { name: 'Results' })
const sidebar = () => screen.getByRole('complementary', { name: 'Filters' })

describe('category page', () => {
  it('lists a kind with breadcrumbs, a count, and more pages by cursor', async () => {
    renderApp('/shop/cpu')
    expect(await screen.findByRole('heading', { level: 1, name: 'Processors' })).toBeInTheDocument()
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(crumbs).getByRole('link', { name: 'Shop' })).toHaveAttribute('href', '/shop')
    expect(await screen.findByText('2 products')).toBeInTheDocument()
    expect(document.title).toBe('Processors | Forge')

    const list = await results()
    expect(await within(list).findByRole('link', { name: 'AMD Ryzen 7 7800X3D' })).toBeInTheDocument()
    expect(within(list).getByText('N$ 7,999.00')).toBeInTheDocument()
    expect(requests.at(-1)?.searchParams.get('kind')).toBe('cpu')
    await userEvent.click(within(list).getByRole('button', { name: 'Show more' }))
    expect(await within(list).findByRole('link', { name: 'AMD Ryzen 7 9800X3D' })).toBeInTheDocument()
    expect(requests.at(-1)?.searchParams.get('cursor')).toBe('c1')
  })

  it('filters by brand and spec from the sidebar, shows chips, and clears them', async () => {
    const router = renderApp('/shop/cpu')
    await results()
    const panel = sidebar()
    await userEvent.click(await within(panel).findByRole('checkbox', { name: /Intel/ }))
    await userEvent.selectOptions(within(panel).getByRole('combobox', { name: 'Socket' }), 'AM5')
    await waitFor(() => {
      expect(router.state.location.search).toBe('?brand=intel&socket=AM5')
    })
    expect(requests.at(-1)?.searchParams.get('brand')).toBe('intel')
    expect(facetRequests.at(-1)?.searchParams.get('socket')).toBe('AM5')

    const chips = screen.getByRole('list', { name: 'Active filters' })
    await userEvent.click(within(chips).getByRole('button', { name: 'Remove filter: Socket: AM5' }))
    expect(router.state.location.search).toBe('?brand=intel')
    await userEvent.click(within(chips).getByRole('button', { name: 'Clear all' }))
    expect(router.state.location.search).toBe('')
  })

  it('applies a price range in N$ as cents', async () => {
    const router = renderApp('/shop/cpu')
    await results()
    const panel = sidebar()
    await userEvent.type(within(panel).getByRole('textbox', { name: 'Minimum (N$)' }), '1,500')
    await userEvent.type(within(panel).getByRole('textbox', { name: 'Maximum (N$)' }), '8000')
    await userEvent.click(within(panel).getByRole('button', { name: 'Apply price' }))
    expect(router.state.location.search).toBe('?min_price=150000&max_price=800000')
    expect(
      await screen.findByRole('button', { name: 'Remove filter: N$ 1,500.00 to N$ 8,000.00' }),
    ).toBeInTheDocument()
  })

  it('refuses a minimum above the maximum', async () => {
    const router = renderApp('/shop/cpu')
    await results()
    const panel = sidebar()
    await userEvent.type(within(panel).getByRole('textbox', { name: 'Minimum (N$)' }), '9000')
    await userEvent.type(within(panel).getByRole('textbox', { name: 'Maximum (N$)' }), '100')
    await userEvent.click(within(panel).getByRole('button', { name: 'Apply price' }))
    expect(within(panel).getByRole('alert')).toHaveTextContent('The minimum is above the maximum.')
    expect(router.state.location.search).toBe('')
  })

  it('switches to a list layout and remembers it', async () => {
    renderApp('/shop/cpu')
    await results()
    await userEvent.click(screen.getByRole('button', { name: 'List view' }))
    expect(screen.getByRole('button', { name: 'List view' })).toHaveAttribute('aria-pressed', 'true')
    expect(localStorage.getItem('forge.catalog.layout')).toBe('list')
  })

  it('moves between categories from the sidebar, dropping filters of the old kind', async () => {
    const router = renderApp('/shop/cpu?socket=AM5&in_stock=true')
    await results()
    await userEvent.click(await within(sidebar()).findByRole('link', { name: /Power supplies/ }))
    expect(router.state.location.pathname).toBe('/shop/psu')
    expect(router.state.location.search).toBe('?in_stock=true')
  })

  it('treats an unknown category as not found', async () => {
    renderApp('/shop/toasters')
    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
  })
})

describe('compatibility with the build', () => {
  beforeEach(() => {
    setDraft({
      name: 'My build',
      buildId: null,
      ownerId: null,
      items: [{ product: psu({ id: 20 }), quantity: 1 }],
    })
  })

  it('narrows to parts that fit, then reveals the others with the reason', async () => {
    const router = renderApp('/shop/cpu')
    await results()
    await userEvent.click(within(sidebar()).getByRole('checkbox', { name: 'Only parts that fit my build' }))
    await waitFor(() => {
      expect(requests.at(-1)?.searchParams.get('compatible_with')).toBe('20')
    })
    expect(router.state.location.search).toBe('?fits_build=1')
    expect(await screen.findByText(/2 parts fit your build/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'show 1 that do not' }))
    const list = await results()
    expect(await within(list).findByText('Does not fit your build')).toBeInTheDocument()
    expect(
      within(list).getByText('The CPU uses LGA1700 but the motherboard has an AM5 socket.'),
    ).toBeInTheDocument()
    expect(within(list).queryByRole('button', { name: 'Add to build: Intel Core i7-14700K' })).toBeNull()
    expect(
      within(list).getByRole('button', { name: 'Add to build: AMD Ryzen 7 7800X3D' }),
    ).toBeInTheDocument()
  })
})

describe('search results', () => {
  it('runs the header search, highlights the match, and filters by kind', async () => {
    const router = renderApp('/search?q=7800')
    expect(await screen.findByRole('heading', { level: 1, name: 'Results for “7800”' })).toBeInTheDocument()
    const list = await results()
    const link = await within(list).findByRole('link', { name: 'AMD Ryzen 7 7800X3D' })
    expect(within(link).getByText('7800', { selector: 'mark' })).toBeInTheDocument()
    expect(requests.at(-1)?.searchParams.get('q')).toBe('7800')

    await userEvent.click(within(sidebar()).getByRole('link', { name: /Processors/ }))
    expect(router.state.location.pathname + router.state.location.search).toBe('/search?q=7800&kind=cpu')
    await waitFor(() => {
      expect(requests.at(-1)?.searchParams.get('kind')).toBe('cpu')
    })
  })

  it('offers a correction when nothing matches', async () => {
    renderApp('/search?q=vengance')
    expect(await screen.findByRole('heading', { name: 'No products match “vengance”' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Search for “vengeance”' })).toHaveAttribute(
      'href',
      '/search?q=vengeance',
    )
  })
})
