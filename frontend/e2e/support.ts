import AxeBuilder from '@axe-core/playwright'
import { expect, request, type Page } from '@playwright/test'

/**
 * The demo customer from `flask seed demo`. These credentials are public demo-only values
 * (documented in the README); override them for any other environment.
 */
export const customer = {
  email: process.env.E2E_CUSTOMER_EMAIL ?? 'demo-customer@example.com',
  password: process.env.E2E_CUSTOMER_PASSWORD ?? 'forge-demo-customer-2026',
}

export const admin = {
  email: process.env.E2E_ADMIN_EMAIL ?? 'demo-admin@example.com',
  password: process.env.E2E_ADMIN_PASSWORD ?? 'forge-demo-admin-2026',
}

export const PSU = { slug: 'seasonic-focus-gx-750-atx-3', name: 'Seasonic FOCUS GX-750 ATX 3' }

/** The CPU the demo path builds around. */
export const CPU = { search: 'x3d', name: 'AMD Ryzen 7 7800X3D', slug: 'amd-ryzen-7-7800x3d' }

/** Enough units for any number of repeated runs between two `flask seed demo` resets. */
const STOCK_FLOOR = 50

/**
 * Specs that buy a fixed part (the demo path's CPU, the checkout specs' PSU) use up its stock: each
 * paid order sells a unit and each abandoned one holds a unit until its reservation expires. Without
 * a top-up, repeated runs fail once the seeded stock runs out ("Only 0 available", or no "Add to
 * cart" button at all). Raises stock on hand through the admin API, as a store admin would. Called
 * once per test run from global-setup.ts: Playwright starts a new worker for every --repeat-each
 * pass, and a sign-in per pass would trip the login rate limit.
 */
export async function ensureStock(baseURL: string, slugs: readonly string[]): Promise<void> {
  const api = await request.newContext({ baseURL })
  try {
    const login = await api.post('/api/v1/auth/login', { data: admin })
    if (!login.ok()) throw new Error(`Admin sign-in for the stock top-up failed: ${String(login.status())}`)
    const { access_token: token } = (await login.json()) as { access_token: string }
    const headers = { Authorization: `Bearer ${token}` }
    for (const slug of slugs) {
      const product = await api.get(`/api/v1/products/${slug}`)
      if (!product.ok()) throw new Error(`Product ${slug}: ${String(product.status())}`)
      const { id } = (await product.json()) as { id: number }
      const inventory = await api.get(`/api/v1/admin/inventory/${String(id)}`, { headers })
      if (!inventory.ok()) throw new Error(`Inventory of ${slug}: ${String(inventory.status())}`)
      const stock = (await inventory.json()) as { quantity_available: number; quantity_reserved: number }
      if (stock.quantity_available >= STOCK_FLOOR) continue
      const update = await api.patch(`/api/v1/admin/inventory/${String(id)}`, {
        headers: { ...headers, 'If-Match': inventory.headers().etag ?? '' },
        data: { quantity_on_hand: stock.quantity_reserved + STOCK_FLOOR },
      })
      if (!update.ok()) throw new Error(`Restocking ${slug}: ${String(update.status())}`)
    }
  } finally {
    await api.dispose()
  }
}

export async function signIn(page: Page, next = '/', account = customer): Promise<void> {
  await page.goto(`/login?next=${encodeURIComponent(next)}`)
  const form = page.getByRole('main')
  await form.getByLabel('Email').fill(account.email)
  await form.getByLabel('Password', { exact: true }).fill(account.password)
  await form.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((url) => url.pathname === new URL(next, url).pathname)
}

/** Leave the signed-in customer's cart with exactly one unit of `slug`. */
export async function cartWithOnly(page: Page, slug: string): Promise<void> {
  await page.goto('/cart')
  const main = page.getByRole('main')
  // A full page load restores the session first; on a freshly started stack that first refresh
  // can take several seconds, so allow more than the default 5 s.
  await expect(main.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 })
  const remove = main.getByRole('button', { name: /^Remove / })
  while ((await remove.count()) > 0) {
    const before = await remove.count()
    await remove.first().click()
    await expect(remove).toHaveCount(before - 1)
  }
  await page.goto(`/products/${slug}`)
  // Wait for the API, not the mini-cart it opens: specs that install a fake clock pause the
  // timers the UI uses to report a finished request.
  const added = page.waitForResponse(
    (response) => response.url().endsWith('/api/v1/cart/items') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Add to cart' }).click()
  expect((await added).ok()).toBe(true)
}

/** From a cart with items, place the order to the default saved address; returns its number. */
export async function placeOrder(page: Page): Promise<string> {
  await page.goto('/checkout?step=review') // the saved default address is already chosen
  await page.getByRole('button', { name: 'Place order and pay' }).click()
  await page.waitForURL(/\/orders\/FRG-\d+\/pay$/)
  const number = /FRG-\d+/.exec(page.url())?.[0]
  if (!number) throw new Error(`No order number in ${page.url()}`)
  return number
}

/**
 * WCAG 2.1 A and AA checks with axe on the screen as it is now. Stripe's card iframe is
 * excluded: it is Stripe's own (cross-origin) document, outside what this app can change.
 */
export async function expectAccessible(page: Page, screen: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('iframe')
    .analyze()
  const problems = results.violations.map(
    (v) =>
      `${v.id} (${v.impact ?? 'unknown'}): ${v.help} [${v.nodes.map((n) => n.target.join(' ')).join(', ')}]`,
  )
  expect(problems, `accessibility problems on ${screen}`).toEqual([])
}

const VISA = '4242424242424242' // Stripe's published test card: succeeds

/** Pay on the pay screen with whichever provider the stack runs: simulated, or Stripe test mode. */
export async function payOnPayScreen(page: Page): Promise<void> {
  const pay = page.getByRole('button', { name: /^Pay N\$ / })
  await expect(pay).toBeVisible()
  const simulated = page.getByText('Test mode: this store uses simulated payments')
  if (!(await simulated.isVisible())) {
    const frame = page.frameLocator('iframe[src*="elements-inner-payment"]')
    await frame.locator('input[name="number"]').fill(VISA)
    await frame.locator('input[name="expiry"]').fill('12 / 34')
    await frame.locator('input[name="cvc"]').fill('123')
    const postal = frame.locator('input[name="postalCode"]')
    if (await postal.isVisible()) await postal.fill('10005')
  }
  await pay.click()
}
