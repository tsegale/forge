import { http, HttpResponse, delay } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAccessToken, setAccessToken } from '@/api/client'
import { server } from '@/test/server'
import { me, onSessionEnded, refresh, withSession } from './session'

const tokens = (token: string) => ({ access_token: token, token_type: 'Bearer', expires_in: 900 })
const expired = {
  error: { code: 'token_expired', message: 'The token has expired.', details: null, request_id: 'r1' },
}
const user = {
  id: 1,
  email: 'ada@example.com',
  first_name: 'Ada',
  last_name: 'L',
  role: 'customer',
  created_at: '2026-10-01T00:00:00Z',
}

beforeEach(() => {
  setAccessToken(null)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('refresh', () => {
  it('is single-flight within a tab: concurrent callers share one request', async () => {
    let calls = 0
    server.use(
      http.post('/api/v1/auth/refresh', async () => {
        calls += 1
        await delay(20)
        return HttpResponse.json(tokens('t1'))
      }),
    )
    const results = await Promise.all([refresh(), refresh(), refresh()])
    expect(results).toEqual([true, true, true])
    expect(calls).toBe(1)
    expect(getAccessToken()).toBe('t1')
  })

  it('runs under a Web Lock so only one tab rotates the cookie at a time', async () => {
    const request = vi.fn((_name: string, callback: () => Promise<boolean>) => callback())
    vi.stubGlobal('navigator', Object.create(navigator, { locks: { value: { request } } }) as Navigator)
    server.use(http.post('/api/v1/auth/refresh', () => HttpResponse.json(tokens('t2'))))
    await refresh()
    expect(request).toHaveBeenCalledWith('forge-auth-refresh', expect.any(Function))
  })

  it('ends the session when the refresh cookie is rejected', async () => {
    setAccessToken('stale')
    const ended = vi.fn()
    const stop = onSessionEnded(ended)
    server.use(http.post('/api/v1/auth/refresh', () => HttpResponse.json(expired, { status: 401 })))
    expect(await refresh()).toBe(false)
    expect(getAccessToken()).toBeNull()
    expect(ended).toHaveBeenCalledOnce()
    stop()
  })
})

describe('withSession', () => {
  it('refreshes once and retries a call that failed with token_expired', async () => {
    setAccessToken('old')
    const seen: (string | null)[] = []
    server.use(
      http.get('/api/v1/auth/me', ({ request }) => {
        seen.push(request.headers.get('Authorization'))
        return seen.length === 1 ? HttpResponse.json(expired, { status: 401 }) : HttpResponse.json(user)
      }),
      http.post('/api/v1/auth/refresh', () => HttpResponse.json(tokens('new'))),
    )
    await expect(withSession(me)).resolves.toMatchObject({ email: 'ada@example.com' })
    expect(seen).toEqual(['Bearer old', 'Bearer new'])
  })

  it('does not retry other errors', async () => {
    let refreshed = false
    server.use(
      http.get('/api/v1/auth/me', () =>
        HttpResponse.json(
          { error: { code: 'forbidden', message: 'No.', details: null, request_id: null } },
          { status: 403 },
        ),
      ),
      http.post('/api/v1/auth/refresh', () => {
        refreshed = true
        return HttpResponse.json(tokens('x'))
      }),
    )
    await expect(withSession(me)).rejects.toMatchObject({ code: 'forbidden' })
    expect(refreshed).toBe(false)
  })
})

describe('cross-tab messages', () => {
  it('a logout in another tab ends this session', async () => {
    setAccessToken('t')
    const ended = new Promise<void>((resolve) => {
      const stop = onSessionEnded(() => {
        stop()
        resolve()
      })
    })
    const otherTab = new BroadcastChannel('forge-auth')
    otherTab.postMessage({ type: 'logout' })
    await ended
    expect(getAccessToken()).toBeNull()
    otherTab.close()
  })

  it('a token refreshed in another tab is adopted here', async () => {
    const otherTab = new BroadcastChannel('forge-auth')
    otherTab.postMessage({ type: 'token', tokens: tokens('from-other-tab') })
    await vi.waitFor(() => {
      expect(getAccessToken()).toBe('from-other-tab')
    })
    otherTab.close()
  })
})
