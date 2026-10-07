import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { tokenFromHash } from '@/auth/passwordReset'
import { signedOut } from '@/test/auth'
import { apiError } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

const TOKEN = 'abcdefghijklmnopqrstuvwxyz0123456789-_AB'
const ACCEPTED = 'If an account exists for that address, we have emailed a link to reset its password.'

let confirmed: unknown = null

beforeEach(() => {
  confirmed = null
  server.use(
    signedOut(),
    http.post('/api/v1/auth/password-reset', () => HttpResponse.json({ message: ACCEPTED }, { status: 202 })),
    http.post('/api/v1/auth/password-reset/confirm', async ({ request }) => {
      confirmed = await request.json()
      return new HttpResponse(null, { status: 204 })
    }),
  )
})

describe('forgot password', () => {
  it('is reachable from sign in and confirms without saying whether the account exists', async () => {
    const router = renderApp('/login')
    await userEvent.click(await screen.findByRole('link', { name: 'Forgot your password?' }))
    expect(router.state.location.pathname).toBe('/forgot-password')
    await userEvent.type(await screen.findByLabelText('Email'), 'ada@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(await screen.findByRole('status')).toHaveTextContent(ACCEPTED)
    expect(screen.getByRole('heading', { level: 1, name: 'Check your email' })).toBeInTheDocument()
  })
})

describe('reset password', () => {
  it('reads the token from the fragment, removes it from the address bar, and returns to sign in', async () => {
    globalThis.history.replaceState(null, '', `/reset-password#token=${TOKEN}`)
    const router = renderApp(`/reset-password#token=${TOKEN}`)
    const password = await screen.findByLabelText('New password')
    expect(globalThis.location.hash).toBe('')

    await userEvent.type(password, 'short')
    await userEvent.click(screen.getByRole('button', { name: 'Set new password' }))
    expect(await screen.findByText('Use at least 12 characters.')).toBeInTheDocument()

    await userEvent.clear(password)
    await userEvent.type(password, 'a-brand-new-passphrase')
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'a-different-passphrase')
    await userEvent.click(screen.getByRole('button', { name: 'Set new password' }))
    expect(await screen.findByText('The two passwords do not match.')).toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText('Confirm new password'))
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'a-brand-new-passphrase')
    await userEvent.click(screen.getByRole('button', { name: 'Set new password' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login')
    })
    expect(confirmed).toEqual({ token: TOKEN, password: 'a-brand-new-passphrase' })
    expect(await screen.findByText('Password changed')).toBeInTheDocument()
  })

  it('offers a new link when the token has expired or been used', async () => {
    server.use(
      http.post('/api/v1/auth/password-reset/confirm', () =>
        HttpResponse.json(apiError('invalid_reset_token', 'This reset link is invalid or has expired.'), {
          status: 400,
        }),
      ),
    )
    globalThis.history.replaceState(null, '', `/reset-password#token=${TOKEN}`)
    renderApp(`/reset-password#token=${TOKEN}`)
    await userEvent.type(await screen.findByLabelText('New password'), 'a-brand-new-passphrase')
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'a-brand-new-passphrase')
    await userEvent.click(screen.getByRole('button', { name: 'Set new password' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'This link has expired' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Send a new link' })).toHaveAttribute('href', '/forgot-password')
  })

  it('says so when the link has no token', async () => {
    globalThis.history.replaceState(null, '', '/reset-password')
    renderApp('/reset-password')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'This link is not valid' }),
    ).toBeInTheDocument()
  })
})

describe('tokenFromHash', () => {
  it('accepts only a well-formed token', () => {
    expect(tokenFromHash(`#token=${TOKEN}`)).toBe(TOKEN)
    expect(tokenFromHash('#token=short')).toBeNull()
    expect(tokenFromHash('#token=<script>alert(1)</script>xxxxxxxxxxxx')).toBeNull()
    expect(tokenFromHash('')).toBeNull()
  })
})

describe('show password', () => {
  it('toggles the field between hidden and visible', async () => {
    renderApp('/login')
    const field = await screen.findByLabelText('Password')
    expect(field).toHaveAttribute('type', 'password')
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(field).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveAttribute('aria-pressed', 'true')
  })
})
