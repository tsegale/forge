import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import { server } from './server'

// Full-page renders run in parallel; give async queries (findBy*, waitFor) room under load.
configure({ asyncUtilTimeout: 5000 })

// Never load Stripe.js from the network in unit tests; pages that pay mock the Stripe components.
vi.mock('@/payments/stripe', () => ({ getStripe: () => Promise.resolve(null) }))

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
})
afterEach(() => {
  cleanup()
  document.cookie = 'forge_session=; path=/; max-age=0'
  server.resetHandlers()
})
afterAll(() => {
  server.close()
})
