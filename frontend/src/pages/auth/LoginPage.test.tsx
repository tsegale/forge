import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '@/test/server'
import { renderApp } from '@/test/render'
import { safeNext } from '@/lib/navigation'

const user = {
  id: 7,
  email: 'ada@example.com',
  first_name: 'Ada',
  last_name: 'L',
  role: 'customer',
  created_at: '2026-10-01T00:00:00Z',
}
const signedOut = () =>
  http.post('/api/v1/auth/refresh', () =>
    HttpResponse.json(
      {
        error: {
          code: 'missing_refresh_token',
          message: 'No refresh token was sent.',
          details: null,
          request_id: null,
        },
      },
      { status: 401 },
    ),
  )

describe('LoginPage', () => {
  it('shows the server message for wrong credentials', async () => {
    server.use(
      signedOut(),
      http.post('/api/v1/auth/login', () =>
        HttpResponse.json(
          {
            error: {
              code: 'invalid_credentials',
              message: 'Incorrect email or password.',
              details: null,
              request_id: 'req-9',
            },
          },
          { status: 401 },
        ),
      ),
    )
    renderApp('/login')
    await userEvent.type(await screen.findByLabelText('Email'), 'ada@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'wrong password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.')
    expect(screen.getByRole('alert')).toHaveTextContent('Reference: req-9')
  })

  it('signs in and returns to the page that asked for it', async () => {
    server.use(
      signedOut(),
      http.post('/api/v1/auth/login', () =>
        HttpResponse.json({ access_token: 'a', token_type: 'Bearer', expires_in: 900 }),
      ),
      http.get('/api/v1/auth/me', () => HttpResponse.json(user)),
    )
    const router = renderApp('/login?next=%2Forders')
    await userEvent.type(await screen.findByLabelText('Email'), 'ada@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'a long enough passphrase')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/orders')
    })
    expect(await screen.findByRole('button', { name: /Ada/ })).toBeInTheDocument() // account menu
  })
})

describe('safeNext', () => {
  it.each([
    ['/orders', '/orders'],
    ['//evil.example.com', '/'],
    ['https://evil.example.com', '/'],
    [null, '/'],
  ])('%s -> %s', (next, expected) => {
    expect(safeNext(next)).toBe(expected)
  })
})
