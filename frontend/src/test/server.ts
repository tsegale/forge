/** Mock Service Worker for unit tests: real fetch calls, answered by handlers declared per test. */
import { setupServer } from 'msw/node'

export const server = setupServer()
