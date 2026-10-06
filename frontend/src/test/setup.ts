import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import { clearDraft } from '@/builds/store'
import { server } from './server'

// Full-page renders run in parallel; give async queries (findBy*, waitFor) room under load.
configure({ asyncUtilTimeout: 5000 })

// jsdom has no pointer capture; Radix (toast swipe, select) calls it on pointer events.
if (!('hasPointerCapture' in Element.prototype)) {
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
  })
}

// Never load Stripe.js from the network in unit tests; pages that pay mock the Stripe components.
vi.mock('@/payments/stripe', () => ({ getStripe: () => Promise.resolve(null) }))

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
})
afterEach(() => {
  cleanup()
  document.cookie = 'forge_session=; path=/; max-age=0'
  server.resetHandlers()
  clearDraft() // module state: one test's build must not leak into the next
  localStorage.clear()
})
afterAll(() => {
  server.close()
})
