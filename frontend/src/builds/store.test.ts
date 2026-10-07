import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setAccessToken } from '@/api/client'
import { logout } from '@/auth/session'
import { cpu } from '@/test/fixtures'
import { server } from '@/test/server'
import { addPart, emptyDraft } from './draft'
import { getDraft, reconcileDraftOwner, setDraft } from './store'

const STORAGE_KEY = 'forge.build-draft.v1'

beforeEach(() => {
  setDraft(emptyDraft())
  setAccessToken('access')
  server.use(http.post('/api/v1/auth/logout', () => new HttpResponse(null, { status: 204 })))
})

describe('draft store on sign-out', () => {
  it('clears a build linked to the account from memory and storage', async () => {
    setDraft({ ...addPart(emptyDraft(), cpu(), 1), buildId: 7, ownerId: 1 })
    expect(localStorage.getItem(STORAGE_KEY)).toContain('"buildId":7')

    await logout()

    expect(getDraft()).toEqual(emptyDraft())
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it("keeps a guest's unsaved build", async () => {
    setDraft(addPart(emptyDraft(), cpu(), 1))

    await logout()

    expect(getDraft().items.map((item) => item.product.id)).toEqual([1])
    expect(localStorage.getItem(STORAGE_KEY)).toContain('"buildId":null')
  })
})

describe('draft store when the session settles', () => {
  const linked = (ownerId: number | null) => ({ ...addPart(emptyDraft(), cpu(), 1), buildId: 7, ownerId })

  it('keeps a build linked to the user who is signed in', () => {
    setDraft(linked(1))
    reconcileDraftOwner(1)
    expect(getDraft().buildId).toBe(7)
  })

  it("drops another account's build, or one found after the session lapsed", () => {
    setDraft(linked(1))
    reconcileDraftOwner(2)
    expect(getDraft()).toEqual(emptyDraft())

    setDraft(linked(1))
    reconcileDraftOwner(null)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it("leaves a guest's unsaved build alone", () => {
    setDraft(addPart(emptyDraft(), cpu(), 1))
    reconcileDraftOwner(2)
    expect(getDraft().items).toHaveLength(1)
  })

  it('treats a stored draft from before owners were recorded as foreign', () => {
    const legacy = { name: 'Old', buildId: 7, items: [] }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy))
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }))
    expect(getDraft().ownerId).toBeNull()
    reconcileDraftOwner(1)
    expect(getDraft().buildId).toBeNull()
  })
})

describe('draft store on page load', () => {
  it('reads the stored draft when the module first loads (a reload)', async () => {
    const stored = { ...addPart(emptyDraft(), cpu(), 1), name: 'Saved earlier' }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
    vi.resetModules()
    const fresh = await import('./store')
    expect(fresh.getDraft().name).toBe('Saved earlier')
    expect(fresh.getDraft().items).toHaveLength(1)
  })

  it('starts empty from corrupt storage', async () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    vi.resetModules()
    const fresh = await import('./store')
    expect(fresh.getDraft()).toEqual(emptyDraft())
  })
})
