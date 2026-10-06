import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/errors'
import { setInspectorOpen, useInspectorOpen } from '@/inspector/store'
import { signedIn, signedOut } from '@/test/auth'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'
import { RouteError } from './RouteError'

function Thrower({ error }: { error: unknown }): never {
  throw error
}

function InspectorState() {
  return <p>{useInspectorOpen() ? 'inspector open' : 'inspector closed'}</p>
}

function renderCrash(error: unknown) {
  const router = createMemoryRouter([
    { path: '/', element: <Thrower error={error} />, errorElement: <RouteError /> },
  ])
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
      <InspectorState />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined) // React logs the thrown error
})
afterEach(() => {
  vi.restoreAllMocks()
  setInspectorOpen(false)
})

describe('RouteError', () => {
  it('shows a way forward and the reference of a failed API call', async () => {
    renderCrash(new ApiError(500, 'internal_error', 'Something broke.', null, 'req-77'))
    expect(screen.getByRole('heading', { level: 1, name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.getByText('req-77')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Open the API Inspector/ }))
    expect(screen.getByText('inspector open')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload the page' })).toBeInTheDocument()
  })

  it('says when the store cannot be reached', () => {
    renderCrash(new ApiError(0, 'network_error', 'Network error.'))
    expect(screen.getByRole('heading', { level: 1, name: 'You appear to be offline' })).toBeInTheDocument()
  })

  it('handles a plain exception without a reference', () => {
    renderCrash(new Error('boom'))
    expect(screen.getByRole('heading', { level: 1, name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.queryByText(/Reference/)).toBeNull()
  })
})

describe('NotFound and Forbidden', () => {
  it('offers search and popular links on an unknown page', async () => {
    server.use(signedOut())
    renderApp('/no-such-page')
    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
    const popular = screen.getByRole('navigation', { name: 'Popular' })
    expect(popular).toHaveTextContent('Build a PC')
    expect(screen.getAllByRole('combobox', { name: 'Search products' }).length).toBeGreaterThan(0)
    expect(document.title).toBe('Page not found | Forge')
  })

  it('tells a customer the admin area is not theirs', async () => {
    server.use(...signedIn())
    renderApp('/admin/orders')
    expect(await screen.findByRole('heading', { level: 1, name: 'Not available' })).toBeInTheDocument()
    expect(screen.getByText('403')).toBeInTheDocument()
  })
})
