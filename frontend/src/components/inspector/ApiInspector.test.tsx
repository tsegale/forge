import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { curlFor } from '@/inspector/curl'
import { clearCalls, parseServerTiming, redact, setInspectorOpen } from '@/inspector/store'
import { signedOut } from '@/test/auth'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

beforeEach(() => {
  server.use(signedOut())
})
afterEach(() => {
  clearCalls()
  setInspectorOpen(false) // module state: an open drawer would block the next test's page
})

describe('redact', () => {
  it('hides secrets at any depth and keeps the rest', () => {
    const out = JSON.parse(
      redact(JSON.stringify({ email: 'a@b.c', password: 'hunter2', nested: [{ access_token: 'x', id: 4 }] })),
    ) as unknown
    expect(out).toEqual({
      email: 'a@b.c',
      password: '[redacted]',
      nested: [{ access_token: '[redacted]', id: 4 }],
    })
  })

  it('leaves non-JSON text as it is', () => {
    expect(redact('plain text')).toBe('plain text')
  })
})

describe('parseServerTiming', () => {
  it('reads app and database time and the statement count', () => {
    expect(
      parseServerTiming('app;dur=12.5;desc="Flask", db;dur=3.2;desc="PostgreSQL, 4 statements"'),
    ).toEqual({
      appMs: 12.5,
      dbMs: 3.2,
      statements: 4,
    })
    expect(parseServerTiming(null)).toBeNull()
  })
})

describe('curlFor', () => {
  it('quotes the body safely for a shell', () => {
    const curl = curlFor(
      {
        id: 1,
        method: 'POST',
        path: '/api/v1/cart/items',
        status: 201,
        startedAt: 0,
        durationMs: 5,
        requestId: null,
        timing: null,
        requestBody: `{"note": "it's"}`,
        responseBody: null,
        errorCode: null,
      },
      'http://127.0.0.1:8080',
    )
    expect(curl).toContain("curl -i -X POST 'http://127.0.0.1:8080/api/v1/cart/items'")
    expect(curl).toContain(`--data '{"note": "it'\\''s"}'`)
  })
})

describe('API Inspector', () => {
  it('opens from the footer and shows each call with its server timing and request id', async () => {
    server.use(
      http.get('/api/v1/config', () =>
        HttpResponse.json(
          {
            currency: 'nad',
            vat_rate_bps: 1500,
            shipping: { flat_cents: 15_000, free_threshold_cents: 500_000 },
            reservation_ttl_seconds: 900,
            payment_provider: 'stripe',
            stripe_publishable_key: null,
          },
          {
            headers: {
              'X-Request-ID': 'req-abc123',
              'Server-Timing': 'app;dur=8.0;desc="Flask", db;dur=2.5;desc="PostgreSQL, 1 statements"',
            },
          },
        ),
      ),
    )
    renderApp('/styleguide')
    const toggle = await screen.findByRole('button', { name: /API Inspector/ })
    await waitFor(() => {
      expect(toggle).toHaveTextContent(/\(\d+\)/)
    })
    await userEvent.click(toggle)
    const drawer = await screen.findByRole('dialog', { name: 'API Inspector' })
    const list = within(drawer).getByRole('list', { name: 'API calls' })
    await userEvent.click(within(list).getByRole('button', { name: /\/api\/v1\/config/ }))
    const detail = within(drawer).getByRole('region', { name: 'Selected call' })
    expect(within(detail).getByText('req-abc123')).toBeInTheDocument()
    expect(within(detail).getByText('2.5 ms')).toBeInTheDocument() // PostgreSQL
    expect(within(detail).getByText('1 SQL statement')).toBeInTheDocument()
    expect(within(detail).getByRole('button', { name: 'Copy as curl' })).toBeInTheDocument()
  })

  it('never records the refresh token or password bodies in clear', async () => {
    server.use(
      http.post('/api/v1/auth/login', () =>
        HttpResponse.json({ access_token: 'secret-access', token_type: 'Bearer', expires_in: 900 }),
      ),
      http.get('/api/v1/auth/me', () =>
        HttpResponse.json({
          id: 1,
          email: 'a@b.c',
          first_name: 'A',
          last_name: 'B',
          role: 'customer',
          created_at: '2026-10-01T00:00:00Z',
        }),
      ),
    )
    renderApp('/login')
    await userEvent.type(await screen.findByLabelText('Email'), 'a@b.c')
    await userEvent.type(screen.getByLabelText('Password'), 'my secret password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await userEvent.click(await screen.findByRole('button', { name: /API Inspector/ }))
    const drawer = await screen.findByRole('dialog', { name: 'API Inspector' })
    await userEvent.click(within(drawer).getByRole('button', { name: /POST.*\/api\/v1\/auth\/login/ }))
    expect(drawer).not.toHaveTextContent('my secret password')
    expect(drawer).not.toHaveTextContent('secret-access')
    expect(drawer).toHaveTextContent('[redacted]')
  })
})
