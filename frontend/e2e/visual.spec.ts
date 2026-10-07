import { expect, test } from '@playwright/test'

/**
 * Visual regression: full-page screenshots at a desktop and a phone width, compared with Linux
 * baselines made on CI (workflow "Visual baselines", run by hand; the baselines are then
 * committed). Runs only with VISUAL=1. What changes with the date or with
 * activity (dates, the price-history axis, the inspector's call count) is masked.
 *
 * Product photos are never part of a baseline (they are the manufacturers' copyrighted images and
 * are not in the repository): every /media request is refused, so each product shows its kind's
 * drawing, the same on CI and on a machine whose database has photos.
 */
const PAGES = [
  ['home', '/'],
  ['catalog', '/shop/cpu'],
  ['product', '/products/amd-ryzen-7-7800x3d'],
  ['configurator', '/configurator'],
  ['cart', '/cart'],
  ['how-it-works', '/how-it-works'],
  ['sign-in', '/login'],
] as const

for (const [width, height] of [
  [1440, 900],
  [390, 844],
] as const) {
  test.describe(`at ${String(width)} px`, () => {
    test.use({ viewport: { width, height } })

    for (const [name, path] of PAGES) {
      test(name, async ({ page }) => {
        await page.route('**/media/**', (route) => route.abort())
        await page.goto(path)
        await page.waitForLoadState('networkidle')
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        // Every refused photo has given way to its drawing.
        await expect(page.locator('img[src*="/media/"]')).toHaveCount(0)
        await expect(page).toHaveScreenshot(`${name}-${String(width)}.png`, {
          fullPage: true,
          mask: [
            page.locator('time'),
            page.locator('figure:has(svg[role="img"])'),
            page.getByRole('button', { name: /API Inspector/ }),
          ],
        })
      })
    }
  })
}
