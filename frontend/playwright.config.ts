import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests against a running stack (E2E_BASE_URL): the Vite dev server in development,
 * `vite preview` of the production build in CI (scripts/ci/start-e2e-stack.sh), or Nginx in the
 * compose stack. Specs that need real Stripe test mode run only with E2E_STRIPE=1. Visual
 * comparisons (visual.spec.ts) run only with VISUAL=1: their baselines are Linux screenshots made
 * on CI (workflow "Visual baselines"), so they are compared on CI, not on a developer's machine.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  testIgnore: process.env.VISUAL ? [] : ['**/visual.spec.ts'],
  expect: {
    // Fonts are self-hosted and animations off; small anti-aliasing differences are tolerated.
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled', caret: 'hide' },
  },
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
