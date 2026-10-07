import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { signedOut } from '@/test/auth'
import { cartWith } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

describe('StyleguidePage', () => {
  it('renders every section from the real components and tokens', async () => {
    server.use(
      signedOut(),
      http.get('/api/v1/cart', () => HttpResponse.json(cartWith(1))),
    )
    renderApp('/styleguide')
    expect(await screen.findByRole('heading', { level: 1, name: 'Forge design system' })).toBeInTheDocument()
    for (const name of ['Colour', 'Typography', 'Buttons', 'Form controls', 'Product card and specs']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument()
    }
    expect(screen.getByText('#1e4fa8')).toBeInTheDocument()
    expect(screen.getByText(/White on Forge blue/).nextSibling).toHaveTextContent('7.67:1')
  })
})
