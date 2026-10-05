import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

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

export async function signIn(page: Page, next = '/', account = customer): Promise<void> {
  await page.goto(`/login?next=${encodeURIComponent(next)}`)
  const form = page.getByRole('main')
  await form.getByLabel('Email').fill(account.email)
  await form.getByLabel('Password').fill(account.password)
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
  await page.getByRole('button', { name: 'Add to cart' }).click()
  await expect(page.getByText('Added to your cart')).toBeVisible()
}

/** From a cart with items, place the order to the default saved address; returns its number. */
export async function placeOrder(page: Page): Promise<string> {
  await page.goto('/checkout')
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
