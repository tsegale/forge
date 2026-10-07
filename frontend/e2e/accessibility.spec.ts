import { expect, test, type Page } from '@playwright/test'
import { admin, expectAccessible, signIn } from './support'

/**
 * Every page, at a desktop and a phone width: no serious or critical axe violation (in fact none
 * at all, WCAG 2.1 A and AA), and no horizontal scrolling at either width.
 */
const GUEST = [
  '/',
  '/shop',
  '/shop/cpu',
  '/search?q=x3d',
  '/products/amd-ryzen-7-7800x3d',
  '/configurator',
  '/cart',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/how-it-works',
  '/styleguide',
  '/no-such-page',
]
const CUSTOMER = [
  '/account',
  '/orders',
  '/builds',
  '/account/addresses',
  '/account/alerts',
  '/account/profile',
  '/checkout',
]
const ADMIN = ['/admin/dashboard', '/admin/orders', '/admin/inventory', '/admin/audit', '/admin/webhooks']

async function check(page: Page, path: string, width: number): Promise<void> {
  await page.goto(path)
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 15_000 })
  await expectAccessible(page, `${path} at ${String(width)} px`)
  const { overflow, offenders } = await page.evaluate(() => {
    const scrolls = (element: Element) => {
      for (let a = element.parentElement; a; a = a.parentElement) {
        if (['auto', 'scroll', 'hidden'].includes(getComputedStyle(a).overflowX)) return true
      }
      return false
    }
    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      offenders: [...document.querySelectorAll('body *')]
        .filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1 && !scrolls(e))
        .slice(0, 5)
        .map((e) => `${e.tagName.toLowerCase()}.${String(e.getAttribute('class')).slice(0, 60)}`),
    }
  })
  expect(
    overflow,
    `${path} scrolls sideways at ${String(width)} px: ${offenders.join(', ')}`,
  ).toBeLessThanOrEqual(0)
}

for (const [width, height] of [
  [1440, 900],
  [390, 844],
] as const) {
  test.describe(`at ${String(width)} px`, () => {
    test.use({ viewport: { width, height } })

    test('every public page', async ({ page }) => {
      test.setTimeout(360_000)
      for (const path of GUEST) await check(page, path, width)
    })

    test("every page of a customer's account, and an order", async ({ page }) => {
      test.setTimeout(360_000)
      await signIn(page, '/orders')
      const first = page
        .getByRole('main')
        .getByRole('link', { name: /^FRG-\d+$/ })
        .first()
      const order = await first.getAttribute('href')
      for (const path of [...CUSTOMER, ...(order ? [order] : [])]) await check(page, path, width)
    })

    test('every back-office page', async ({ page }) => {
      test.setTimeout(360_000)
      await signIn(page, '/admin/dashboard', admin)
      for (const path of ADMIN) await check(page, path, width)
    })
  })
}
