import { expect, type Page } from '@playwright/test'

/**
 * The demo customer from `flask seed demo`. These credentials are public demo-only values
 * (documented in the README); override them for any other environment.
 */
export const customer = {
  email: process.env.E2E_CUSTOMER_EMAIL ?? 'demo-customer@example.com',
  password: process.env.E2E_CUSTOMER_PASSWORD ?? 'forge-demo-customer-2026',
}

export const PSU = { slug: 'seasonic-focus-gx-750-atx-3', name: 'Seasonic FOCUS GX-750 ATX 3' }

export async function signIn(page: Page, next = '/'): Promise<void> {
  await page.goto(`/login?next=${encodeURIComponent(next)}`)
  const form = page.getByRole('main')
  await form.getByLabel('Email').fill(customer.email)
  await form.getByLabel('Password').fill(customer.password)
  await form.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((url) => url.pathname === new URL(next, url).pathname)
}

/** Leave the signed-in customer's cart with exactly one unit of `slug`. */
export async function cartWithOnly(page: Page, slug: string): Promise<void> {
  await page.goto('/cart')
  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { level: 1 })).toBeVisible()
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
