import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import { server } from './server'

// Never load Stripe.js from the network in unit tests; pages that pay mock the Stripe components.
vi.mock('@/payments/stripe', () => ({ getStripe: () => Promise.resolve(null) }))

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
})
afterEach(() => {
  cleanup()
  server.resetHandlers()
})
afterAll(() => {
  server.close()
})
