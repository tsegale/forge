/**
 * Session management.
 *
 * - The access token lives only in memory (client.ts). Nothing auth-related is ever written to
 *   localStorage or sessionStorage.
 * - The refresh token is an HttpOnly, Secure, SameSite=Strict cookie scoped to /api/v1/auth; this
 *   code never sees it. A reload restores the session by calling /auth/refresh.
 * - Refreshing is single-flight: within a tab concurrent callers share one promise, and across
 *   tabs the Web Locks API admits one refresh at a time. A new access token is broadcast to the
 *   other tabs (memory to memory, over BroadcastChannel), so a tab that waited for the lock finds
 *   a fresh token and does not rotate the cookie again.
 * - Logging out broadcasts to every tab.
 */
import { api, getAccessToken, setAccessToken, unwrap } from '@/api/client'
import { ApiError } from '@/api/errors'
import type { components } from '@/api/schema'

export type User = components['schemas']['UserResponse']
type TokenResponse = components['schemas']['TokenResponse']

const LOCK_NAME = 'forge-auth-refresh'
const CHANNEL_NAME = 'forge-auth'
const REFRESH_MARGIN_MS = 60_000

let inFlight: Promise<boolean> | null = null
let refreshTimer: ReturnType<typeof setTimeout> | undefined
let tokenObtainedAt = 0
const listeners = new Set<() => void>()

/** Notified when the session ends (expired, logged out here or in another tab). */
export function onSessionEnded(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function endSession(): void {
  setAccessToken(null)
  clearTimeout(refreshTimer)
  for (const listener of listeners) listener()
}

const channel: BroadcastChannel | null =
  typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME)
type Broadcast = { type: 'logout' } | { type: 'token'; tokens: TokenResponse }

channel?.addEventListener('message', (event: MessageEvent<Broadcast>) => {
  if (event.data.type === 'logout') endSession()
  else acceptTokens(event.data.tokens)
})

function acceptTokens(tokens: TokenResponse): void {
  setAccessToken(tokens.access_token)
  tokenObtainedAt = Date.now()
  clearTimeout(refreshTimer)
  refreshTimer = setTimeout(
    () => void refresh(),
    Math.max(tokens.expires_in * 1000 - REFRESH_MARGIN_MS, 5_000),
  )
}

async function doRefresh(startedAt: number): Promise<boolean> {
  // A token that arrived after this refresh was requested (another tab broadcast one while this
  // tab waited for the lock) is fresh: keep it instead of rotating the cookie again.
  if (getAccessToken() && tokenObtainedAt > startedAt) return true
  try {
    const tokens = await unwrap(api.POST('/api/v1/auth/refresh'))
    acceptTokens(tokens)
    channel?.postMessage({ type: 'token', tokens } satisfies Broadcast)
    return true
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      endSession()
      return false
    }
    throw error
  }
}

/** Exchange the refresh cookie for a new access token. Resolves false if there is no session. */
export function refresh(): Promise<boolean> {
  if (inFlight) return inFlight
  const startedAt = Date.now()
  const run = () => doRefresh(startedAt)
  // Browsers without the Web Locks API still get single-flight within the tab.
  const locks = typeof navigator === 'undefined' ? undefined : (navigator.locks as LockManager | undefined)
  const underLock = async (): Promise<boolean> => (locks ? await locks.request(LOCK_NAME, run) : run())
  const pending = underLock().finally(() => {
    inFlight = null
  })
  inFlight = pending
  return pending
}

export async function login(email: string, password: string): Promise<User> {
  acceptTokens(await unwrap(api.POST('/api/v1/auth/login', { body: { email, password } })))
  return me()
}

export async function register(body: components['schemas']['RegisterRequest']): Promise<User> {
  return unwrap(api.POST('/api/v1/auth/register', { body }))
}

export async function me(): Promise<User> {
  return unwrap(api.GET('/api/v1/auth/me'))
}

export async function logout(): Promise<void> {
  try {
    await unwrap(api.POST('/api/v1/auth/logout'))
  } finally {
    endSession()
    channel?.postMessage({ type: 'logout' } satisfies Broadcast)
  }
}

/** Restore a session after a reload. Resolves to the user, or null if signed out. */
export async function restore(): Promise<User | null> {
  return (await refresh()) ? me() : null
}

/**
 * Run an API call; if the access token expired mid-session, refresh once and retry. The call is
 * a thunk so it can be re-issued (a request body can only be sent once).
 */
export async function withSession<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call()
  } catch (error) {
    const expired = error instanceof ApiError && error.status === 401 && error.code === 'token_expired'
    if (!expired || !(await refresh())) throw error
    return call()
  }
}
