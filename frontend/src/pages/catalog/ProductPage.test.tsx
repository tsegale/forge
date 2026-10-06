import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import type { components } from '@/api/schema'
import { getDraft, setDraft } from '@/builds/store'
import { signedIn, signedOut } from '@/test/auth'
import { apiError, cpu, kinds, psu, report } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

type Detail = components['schemas']['ProductDetail']

const photo = (n: number) => ({
  thumb: `/media/products/FRG-CPU-R7-7800X3D-${String(n)}-thumb.webp`,
  card: `/media/products/FRG-CPU-R7-7800X3D-${String(n)}-card.webp`,
  full: `/media/products/FRG-CPU-R7-7800X3D-${String(n)}-full.webp`,
  alt: `AMD Ryzen 7 7800X3D, view ${String(n)}`,
  width: 1280,
  height: 960,
})

const detail = (overrides: Partial<Detail> = {}): Detail => ({
  ...cpu(),
  description: 'Eight cores with 3D V-Cache for gaming.',
  category: { id: 3, name: 'Processors', slug: 'processors' },
  images: [photo(1), photo(2)],
  image: photo(1),
  rating: { average: 4.5, count: 2 },
  ...overrides,
})

const review = (id: number, overrides: Partial<components['schemas']['ReviewResponse']> = {}) => ({
  id,
  rating: 5,
  title: 'The gaming chip to get',
  body: 'Smooth frame times in every game I tried.',
  author: 'Tomas K.',
  is_verified_purchase: true,
  created_at: '2026-09-01T10:00:00Z',
  updated_at: '2026-09-01T10:00:00Z',
  ...overrides,
})

const reviewPage = {
  summary: { average: 4.5, count: 2, counts: { '1': 0, '2': 0, '3': 0, '4': 1, '5': 1 } },
  items: [review(1), review(2, { rating: 4, title: null, author: 'Selma N.', is_verified_purchase: false })],
  next_cursor: null,
}

const history = {
  currency: 'nad',
  days: 90,
  points: [
    { at: '2026-07-08T00:00:00Z', price_cents: 899_900 },
    { at: '2026-09-20T00:00:00Z', price_cents: 799_900 },
  ],
  current_cents: 799_900,
  lowest_cents: 799_900,
  highest_cents: 899_900,
  change_cents: -100_000,
}

let posted: unknown = null

beforeEach(() => {
  posted = null
  server.use(
    signedOut(),
    http.get('/api/v1/products/:slug', ({ params }) =>
      params.slug === 'amd-ryzen-7-7800x3d'
        ? HttpResponse.json(detail())
        : HttpResponse.json(apiError('not_found', 'Product not found.'), { status: 404 }),
    ),
    http.get('/api/v1/products/:slug/price-history', ({ request }) =>
      HttpResponse.json({ ...history, days: Number(new URL(request.url).searchParams.get('days')) }),
    ),
    http.get('/api/v1/products/:slug/reviews', () => HttpResponse.json(reviewPage)),
    http.get('/api/v1/products', () => HttpResponse.json({ items: [], next_cursor: null })),
  )
})

const open = async () => {
  renderApp('/products/amd-ryzen-7-7800x3d')
  return screen.findByRole('heading', { level: 1, name: 'AMD Ryzen 7 7800X3D' })
}

describe('ProductPage', () => {
  it('shows the buy box, breadcrumbs, key specs and a page title', async () => {
    await open()
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(crumbs).getByRole('link', { name: 'Processors' })).toHaveAttribute('href', '/shop/cpu')
    expect(screen.getAllByText('N$ 7,999.00').length).toBeGreaterThan(0)
    expect(screen.getByRole('list', { name: 'Key specifications' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /4\.5 \(2 reviews\)/ })).toHaveAttribute('href', '#reviews')
    expect(document.title).toBe('AMD Ryzen 7 7800X3D | Forge')
  })

  it('switches photos and zooms with the keyboard', async () => {
    await open()
    const thumbs = screen.getByRole('list', { name: 'Photos' })
    await userEvent.click(within(thumbs).getByRole('button', { name: 'Show photo 2 of 2' }))
    expect(within(thumbs).getByRole('button', { name: 'Show photo 2 of 2' })).toHaveAttribute(
      'aria-current',
      'true',
    )

    await userEvent.click(screen.getByRole('button', { name: 'Zoom: AMD Ryzen 7 7800X3D, view 2' }))
    const dialog = await screen.findByRole('dialog', { name: 'AMD Ryzen 7 7800X3D' })
    expect(within(dialog).getByRole('img', { name: 'AMD Ryzen 7 7800X3D, view 2' })).toHaveAttribute(
      'src',
      photo(2).full,
    )
    await userEvent.keyboard('{ArrowRight}')
    expect(within(dialog).getByText('Photo 1 of 2')).toBeInTheDocument()
  })

  it('charts the price history with a table fallback and changes the period', async () => {
    await open()
    const chart = await screen.findByRole('img', {
      name: /Price of AMD Ryzen 7 7800X3D over the last 90 days/,
    })
    expect(chart).toHaveAccessibleDescription(/N\$ 8,999.00 at the start, N\$ 7,999.00 now/)
    expect(screen.getByText('N$ 1,000.00 lower')).toBeInTheDocument()
    const table = screen.getByRole('table', { name: /over the last 90 days/ })
    expect(within(table).getAllByRole('row')).toHaveLength(3)

    await userEvent.click(screen.getByRole('button', { name: '1 year' }))
    expect(await screen.findByRole('img', { name: /over the last year/ })).toBeInTheDocument()
  })

  it('lists reviews with the distribution and verified badges', async () => {
    await open()
    const section = screen.getByRole('region', { name: 'Reviews' })
    expect(await within(section).findByText('The gaming chip to get')).toBeInTheDocument()
    expect(within(section).getAllByText('Verified purchase')).toHaveLength(1)
    expect(within(section).getByRole('link', { name: 'Sign in to write a review' })).toHaveAttribute(
      'href',
      '/login?next=%2Fproducts%2Famd-ryzen-7-7800x3d%23reviews',
    )
  })

  it('asks the build whether the part fits and explains a conflict', async () => {
    setDraft({
      name: 'My build',
      buildId: null,
      ownerId: null,
      items: [{ product: psu({ id: 20 }), quantity: 1 }],
    })
    server.use(
      http.post('/api/v1/compatibility/check', () =>
        HttpResponse.json(
          report({
            compatible: false,
            conflicts: [
              {
                code: 'PSU_INSUFFICIENT',
                severity: 'conflict',
                message: 'The build can draw 640 W at peak; the 550 W supply is too small.',
                product_ids: [1, 20],
                details: {},
              },
            ],
          }),
        ),
      ),
    )
    await open()
    const verdict = await screen.findByRole('region', { name: 'Does not fit your build' })
    expect(within(verdict).getByText(/the 550 W supply is too small/)).toBeInTheDocument()
  })

  it('adds the part to the build and opens the configurator', async () => {
    server.use(
      http.get('/api/v1/component-kinds', () => HttpResponse.json(kinds)),
      http.post('/api/v1/compatibility/check', () => HttpResponse.json(report())),
    )
    const router = renderApp('/products/amd-ryzen-7-7800x3d')
    await userEvent.click(await screen.findByRole('button', { name: 'Add to build' }))
    expect(getDraft().items.map((item) => item.product.id)).toEqual([1])
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/configurator')
    })
  })

  it('shows the not-found page for an unknown product', async () => {
    renderApp('/products/no-such-part')
    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
  })
})

describe('writing a review', () => {
  beforeEach(() => {
    server.use(
      ...signedIn(),
      http.get('/api/v1/products/:slug/reviews/mine', () =>
        HttpResponse.json(apiError('not_found', 'You have not reviewed this product.'), { status: 404 }),
      ),
      http.post('/api/v1/products/:slug/reviews', async ({ request }) => {
        posted = await request.json()
        return HttpResponse.json(review(3, { author: 'Ada L.' }), { status: 201 })
      }),
    )
  })

  it('validates, then posts the rating and text', async () => {
    await open()
    await userEvent.click(await screen.findByRole('button', { name: 'Write a review' }))
    const dialog = await screen.findByRole('dialog', { name: 'Write a review' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Post review' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Choose a rating from 1 to 5 stars.')

    await userEvent.click(within(dialog).getByRole('radio', { name: '4 stars' }))
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: /Your review/ }),
      'Fast and cool with a tower.',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Post review' }))
    await waitFor(() => {
      expect(posted).toEqual({ rating: 4, title: null, body: 'Fast and cool with a tower.' })
    })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })
})
