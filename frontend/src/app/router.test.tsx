import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { routes } from '@/app/router'

function renderAt(path: string) {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />)
}

describe('app shell', () => {
  it('renders navigation and the active page', () => {
    renderAt('/configurator')
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Build a PC' })).toHaveClass('text-accent')
    expect(screen.getByRole('heading', { name: 'Build a PC' })).toBeInTheDocument()
  })

  it('shows a not-found page for unknown paths', () => {
    renderAt('/no-such-page')
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})
