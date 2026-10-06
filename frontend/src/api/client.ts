/**
 * Typed API client. Every path, parameter and response type comes from schema.d.ts, which is
 * generated from the backend's OpenAPI document (npm run api:types); CI fails if it is stale.
 */
import createClient, { type Middleware } from 'openapi-fetch'
import { finishCall, parseServerTiming, redact, startCall } from '@/inspector/store'
import { networkError, toApiError } from './errors'
import type { paths } from './schema'

export type { components, paths } from './schema'

/** Access token, held in memory only (never localStorage). Set by the auth layer. */
let accessToken: string | null = null

export function setAccessToken(token: string | null): void {
  accessToken = token
}

export function getAccessToken(): string | null {
  return accessToken
}

const authHeader: Middleware = {
  onRequest({ request }) {
    if (accessToken && !request.headers.has('Authorization')) {
      request.headers.set('Authorization', `Bearer ${accessToken}`)
    }
    return request
  },
}

const callIds = new WeakMap<Request, number>()

function errorCode(text: string): string | null {
  try {
    const body = JSON.parse(text) as { error?: { code?: unknown } }
    return typeof body.error?.code === 'string' ? body.error.code : null
  } catch {
    return null
  }
}

/** Records each call for the API Inspector (redacted, this tab only). */
const inspector: Middleware = {
  async onRequest({ request }) {
    const body = request.body ? await request.clone().text() : null
    const url = new URL(request.url)
    callIds.set(request, startCall(request.method, url.pathname + url.search, body))
    return undefined
  },
  async onResponse({ request, response }) {
    const id = callIds.get(request)
    if (id === undefined) return undefined
    const text = response.status === 204 ? '' : await response.clone().text()
    finishCall(id, {
      status: response.status,
      requestId: response.headers.get('X-Request-ID'),
      timing: parseServerTiming(response.headers.get('Server-Timing')),
      responseBody: text ? redact(text) : null,
      errorCode: response.ok ? null : errorCode(text),
    })
    return undefined
  },
  onError({ request }) {
    const id = callIds.get(request)
    if (id !== undefined) finishCall(id, { errorCode: 'network_error' })
    return undefined
  },
}

// Same origin as the page (Nginx serves both in production, the Vite proxy in development), so
// cookies flow and no CORS is involved.
export const api = createClient<paths>({
  baseUrl: globalThis.location.origin,
  credentials: 'same-origin',
  // Resolve fetch at call time, not at import time, so instrumentation (and test mocks) apply.
  fetch: (request: Request) => globalThis.fetch(request),
})
api.use(inspector, authHeader)

interface Result<T> {
  data?: T
  error?: unknown
  response: Response
}

/** Return the data or throw an ApiError built from the backend's error envelope. */
export async function unwrap<T>(call: Promise<Result<T>>): Promise<T> {
  let result: Result<T>
  try {
    result = await call
  } catch {
    throw networkError()
  }
  if (!result.response.ok || result.data === undefined) {
    if (result.response.status === 204) return undefined as T
    throw toApiError(result.response.status, result.error, result.response.headers)
  }
  return result.data
}
