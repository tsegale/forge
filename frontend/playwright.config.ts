import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests against a running stack (E2E_BASE_URL): the Vite dev server in development,
 * Nginx in the compose stack. Specs that need real Stripe test mode run only with E2E_STRIPE=1.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // one demo customer, one cart: specs run in order
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 90_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
