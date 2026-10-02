/** MSW handlers for the two session states a page test starts in. */
import { http, HttpResponse } from 'msw'
import { customer } from './fixtures'

export const signedOut = () =>
  http.post('/api/v1/auth/refresh', () =>
    HttpResponse.json(
      { error: { code: 'missing_refresh_token', message: 'x', details: null, request_id: null } },
      { status: 401 },
    ),
  )

export const signedIn = () => [
  http.post('/api/v1/auth/refresh', () =>
    HttpResponse.json({ access_token: 'access', token_type: 'Bearer', expires_in: 900 }),
  ),
  http.get('/api/v1/auth/me', () => HttpResponse.json(customer)),
]
