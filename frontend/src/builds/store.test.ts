import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { setAccessToken } from '@/api/client'
import { logout } from '@/auth/session'
import { cpu } from '@/test/fixtures'
import { server } from '@/test/server'
import { addPart, emptyDraft } from './draft'
import { getDraft, setDraft } from './store'

const STORAGE_KEY = 'forge.build-draft.v1'

beforeEach(() => {
  setDraft(emptyDraft())
  setAccessToken('access')
  server.use(http.post('/api/v1/auth/logout', () => new HttpResponse(null, { status: 204 })))
})

describe('draft store on sign-out', () => {
  it('clears a build linked to the account from memory and storage', async () => {
    setDraft({ ...addPart(emptyDraft(), cpu(), 1), buildId: 7 })
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
