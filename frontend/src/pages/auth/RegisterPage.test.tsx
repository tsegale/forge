import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { signedOut } from '@/test/auth'
import { customer } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

describe('RegisterPage', () => {
  it('creates the account, signs in and returns to the page that asked for it', async () => {
    server.use(
      signedOut(),
      http.post('/api/v1/auth/register', () => HttpResponse.json(customer, { status: 201 })),
      http.post('/api/v1/auth/login', () =>
        HttpResponse.json({ access_token: 'a', token_type: 'Bearer', expires_in: 900 }),
      ),
      http.get('/api/v1/auth/me', () => HttpResponse.json(customer)),
      http.get('/api/v1/builds', () => HttpResponse.json({ items: [] })),
    )
    const router = renderApp('/register?next=%2Fbuilds')
    const main = await screen.findByRole('main')
    expect(await within(main).findByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login?next=%2Fbuilds',
    )
    await userEvent.type(screen.getByLabelText('First name'), 'Ada')
    await userEvent.type(screen.getByLabelText('Last name'), 'L')
    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'a long enough passphrase')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/builds')
    })
  })
})
