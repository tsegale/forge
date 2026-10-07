import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import type { components } from '@/api/schema'
import { addPart, emptyDraft } from '@/builds/draft'
import { setDraft } from '@/builds/store'
import { signedIn, signedOut } from '@/test/auth'
import { cpu, kinds, nad, report } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

type BuildDetail = components['schemas']['BuildDetail']

const productRequests: URL[] = []
const gpu = cpu({ id: 5, kind: 'gpu', slug: 'rtx-4070', name: 'NVIDIA GeForce RTX 4070' })

beforeEach(() => {
  setDraft(emptyDraft())
  productRequests.length = 0
  server.use(
    signedOut(),
    http.get('/api/v1/component-kinds', () => HttpResponse.json(kinds)),
    http.get('/api/v1/products', ({ request }) => {
      const url = new URL(request.url)
      productRequests.push(url)
      return HttpResponse.json({
        items: url.searchParams.get('kind') === 'gpu' ? [gpu] : [cpu()],
        next_cursor: null,
      })
    }),
    http.get('/api/v1/products/:slug', ({ params }) =>
      HttpResponse.json({
        ...(params.slug === gpu.slug ? gpu : cpu()),
        description: null,
      }),
    ),
    http.post('/api/v1/compatibility/check', () => HttpResponse.json(report())),
  )
})

describe('ConfiguratorPage', () => {
  it('picks parts and narrows later choices to compatible ones', async () => {
    renderApp('/configurator')
    await userEvent.click(await screen.findByRole('button', { name: 'Choose CPU' }))
    const dialog = await screen.findByRole('dialog', { name: 'Choose CPU' })
    expect(productRequests.at(-1)?.searchParams.has('compatible_with')).toBe(false)
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Select AMD Ryzen 7 7800X3D' }))

    const parts = screen.getByRole('list', { name: 'Components' })
    expect(await within(parts).findByRole('link', { name: 'AMD Ryzen 7 7800X3D' })).toBeInTheDocument()
    const summary = screen.getByRole('complementary', { name: 'Build summary' })
    expect(await within(summary).findByText('Compatible so far')).toBeInTheDocument()
    expect(within(summary).getByText('Still needed: Graphics card')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Choose graphics card' }))
    await screen.findByRole('dialog', { name: 'Choose graphics card' })
    await waitFor(() => {
      expect(productRequests.at(-1)?.searchParams.getAll('compatible_with')).toEqual(['1'])
    })
  })

  it('flags conflicting parts with the reason', async () => {
    setDraft((draft) => addPart(addPart(draft, cpu(), 1), gpu, 2))
    server.use(
      http.post('/api/v1/compatibility/check', () =>
        HttpResponse.json(
          report({
            compatible: false,
            conflicts: [
              {
                code: 'GPU_TOO_LONG',
                severity: 'conflict',
                message: 'The graphics card is 336 mm long; the case fits 320 mm.',
                product_ids: [5],
                details: { gpu_length_mm: 336, case_max_gpu_length_mm: 320 },
              },
            ],
          }),
        ),
      ),
    )
    renderApp('/configurator')
    const summary = screen.getByRole('complementary', { name: 'Build summary' })
    expect(await within(summary).findByText('1 conflict')).toBeInTheDocument()
    // On the part itself: the engine's message and the two measurements it compared.
    const findings = await screen.findByRole('list', { name: `Findings for ${gpu.name}` })
    expect(
      within(findings).getByText('The graphics card is 336 mm long; the case fits 320 mm.'),
    ).toBeInTheDocument()
    expect(within(findings).getByText('Card length').nextElementSibling).toHaveTextContent('336 mm')
    expect(within(findings).getByText('Case fits up to').nextElementSibling).toHaveTextContent('320 mm')
    // The docked bar (phones) carries the same verdict.
    expect(screen.getAllByText('1 conflict')).toHaveLength(2)
  })

  it('lists parts that do not fit on request, with the reason, and will not add them', async () => {
    setDraft((draft) => addPart(draft, cpu(), 1))
    const tooLong = cpu({
      id: 7,
      kind: 'gpu',
      slug: 'rtx-4090',
      name: 'NVIDIA GeForce RTX 4090',
      compatibility: {
        compatible: false,
        conflicts: [
          {
            code: 'PSU_INSUFFICIENT',
            severity: 'conflict',
            message: 'The build can draw 760 W at peak; the 550 W supply is too small.',
            product_ids: [6, 7],
            details: { peak_w: 760, psu_w: 550 },
          },
        ],
        warnings: [],
      },
    })
    server.use(
      http.get('/api/v1/products', ({ request }) => {
        const url = new URL(request.url)
        productRequests.push(url)
        const all = url.searchParams.get('include_incompatible') === 'true'
        return HttpResponse.json({ items: all ? [gpu, tooLong] : [gpu], next_cursor: null })
      }),
    )
    renderApp('/configurator')
    await userEvent.click(await screen.findByRole('button', { name: 'Choose graphics card' }))
    const picker = await screen.findByRole('dialog', { name: 'Choose graphics card' })
    await userEvent.click(within(picker).getByRole('checkbox', { name: 'Show parts that do not fit' }))
    expect(await within(picker).findByText(/the 550 W supply is too small/)).toBeInTheDocument()
    expect(within(picker).getByText('Peak draw').nextElementSibling).toHaveTextContent('760 W')
    expect(within(picker).getByRole('button', { name: 'Add NVIDIA GeForce RTX 4090' })).toBeDisabled()
    expect(within(picker).getByRole('button', { name: 'Add NVIDIA GeForce RTX 4070' })).toBeEnabled()
  })

  it('opens the full summary from the docked bar', async () => {
    setDraft((draft) => addPart(draft, cpu(), 1))
    renderApp('/configurator')
    await userEvent.click(await screen.findByRole('button', { name: 'Summary' }))
    const sheet = await screen.findByRole('dialog', { name: 'Build summary' })
    expect(within(sheet).getByRole('heading', { name: 'Compatibility' })).toBeInTheDocument()
    expect(within(sheet).getByRole('link', { name: 'Sign in to save and check out' })).toBeInTheDocument()
  })

  it('asks a guest to sign in, returning to save the draft', async () => {
    setDraft((draft) => addPart(draft, cpu(), 1))
    renderApp('/configurator')
    const link = await screen.findByRole('link', { name: 'Sign in to save and check out' })
    expect(link).toHaveAttribute('href', '/login?next=%2Fconfigurator%3Fsave%3D1')
  })

  it('saves, validates and offers checkout for a signed-in customer', async () => {
    let build: BuildDetail | null = null
    const calls: string[] = []
    const detail = (): BuildDetail => {
      if (!build) throw new Error('no build yet')
      return build
    }
    server.use(
      ...signedIn(),
      http.post('/api/v1/builds', async ({ request }) => {
        calls.push('create')
        const body = (await request.json()) as { name: string }
        build = {
          id: 7,
          name: body.name,
          status: 'draft',
          item_count: 0,
          subtotal: nad(0),
          updated_at: '2026-10-02T08:00:00Z',
          items: [],
        }
        return HttpResponse.json(build, { status: 201 })
      }),
      http.post('/api/v1/builds/7/items', async ({ request }) => {
        const body = (await request.json()) as { product_id: number; quantity: number }
        calls.push(`add ${String(body.product_id)}`)
        const current = detail()
        current.items.push({ id: 70, quantity: body.quantity, line_total: cpu().price, product: cpu() })
        return HttpResponse.json(current, { status: 201 })
      }),
      http.get('/api/v1/builds/7', () => HttpResponse.json(detail())),
      http.post('/api/v1/builds/7/validate', () => {
        calls.push('validate')
        detail().status = 'validated'
        return HttpResponse.json({ ...report({ complete: true, missing_kinds: [] }), status: 'validated' })
      }),
      http.get('/api/v1/builds', () => HttpResponse.json({ items: [] })),
    )
    setDraft((draft) => addPart(draft, cpu(), 1))
    renderApp('/configurator')

    await userEvent.click(await screen.findByRole('button', { name: 'Validate' }))
    const checkout = await screen.findByRole('link', { name: 'Check out this build' })
    expect(checkout).toHaveAttribute('href', '/checkout?build=7')
    expect(calls).toEqual(['create', 'add 1', 'validate'])
    expect(screen.getByText(/All changes saved/)).toBeInTheDocument()
  })
})
