import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '@/test/server'
import { renderApp } from '@/test/render'

beforeEach(() => {
  server.use(
    http.post('/api/v1/auth/refresh', () =>
      HttpResponse.json(
        { error: { code: 'missing_refresh_token', message: 'x', details: null, request_id: null } },
        { status: 401 },
      ),
    ),
  )
})

describe('app shell', () => {
  it('renders navigation, the active page, and a sign-in link when signed out', async () => {
    renderApp('/configurator')
    const shop = screen.getByRole('navigation', { name: 'Shop' })
    expect(within(shop).getByRole('button', { name: /Shop by category/ })).toBeInTheDocument()
    expect(within(shop).getByRole('link', { name: 'Build a PC' })).toHaveClass('text-accent')
    expect(screen.getAllByRole('search').length).toBeGreaterThan(0) // desktop and phone rows; CSS shows one
    expect(screen.getByRole('heading', { name: 'Build a PC' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('shows a not-found page for unknown paths', () => {
    renderApp('/no-such-page')
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})
