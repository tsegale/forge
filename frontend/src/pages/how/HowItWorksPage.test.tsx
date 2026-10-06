import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { signedOut } from '@/test/auth'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

describe('How Forge works', () => {
  it('is linked from the footer and explains the engine, the database rules and checkout', async () => {
    server.use(signedOut())
    const router = renderApp('/')
    await userEvent.click(await screen.findByRole('link', { name: 'How Forge works' }))
    expect(router.state.location.pathname).toBe('/how-it-works')
    expect(await screen.findByRole('heading', { level: 1, name: 'How Forge works' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Order lifecycle' })).toHaveAccessibleDescription(/late payment/)
    const rules = screen.getByRole('table', { name: /Rules the database enforces/ })
    expect(within(rules).getAllByRole('row').length).toBeGreaterThan(8)
    expect(within(screen.getByRole('main')).getByRole('link', { name: /Design system/ })).toHaveAttribute(
      'href',
      '/styleguide',
    )
    expect(document.title).toBe('How Forge works | Forge')
  })
})
