import { expect, test, type Locator, type Page } from '@playwright/test'
import { customer, PSU } from './support'

/**
 * Press Tab until `target` has focus, as a keyboard user would. Fails if it is never reached:
 * that is the point of the test (every step of a purchase must be reachable without a pointer).
 */
async function tabTo(page: Page, target: Locator, limit = 120): Promise<void> {
  await expect(target).toBeVisible()
  for (let i = 0; i < limit; i++) {
    if (await target.evaluate((element) => element === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  throw new Error(`Not reachable with Tab in ${String(limit)} presses: ${target.toString()}`)
}

test.skip(process.env.E2E_STRIPE === '1', 'Keyboard entry into Stripe’s own card frame is Stripe’s to test.')

test('a customer can buy a part with the keyboard alone', async ({ page }) => {
  test.setTimeout(180_000)

  // Sign in: the first Tab offers the skip link, then the form is filled and sent with Enter.
  await page.goto(`/login?next=${encodeURIComponent(`/products/${PSU.slug}`)}`)
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
  const main = page.getByRole('main')
  await tabTo(page, main.getByLabel('Email'))
  await page.keyboard.type(customer.email)
  await tabTo(page, main.getByLabel('Password', { exact: true }))
  await page.keyboard.type(customer.password)
  await page.keyboard.press('Enter')
  await page.waitForURL(`/products/${PSU.slug}`)

  // Start from an empty cart (cart lines are removed with the keyboard too).
  await page.goto('/cart')
  const remove = page.getByRole('main').getByRole('button', { name: /^Remove / })
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 })
  while ((await remove.count()) > 0) {
    const before = await remove.count()
    await tabTo(page, remove.first())
    await page.keyboard.press('Enter')
    await expect(remove).toHaveCount(before - 1)
  }

  // Add to cart; the mini-cart opens with focus inside it, and leads to checkout.
  await page.goto(`/products/${PSU.slug}`)
  await tabTo(page, page.getByRole('button', { name: 'Add to cart' }))
  await page.keyboard.press('Enter')
  const miniCart = page.getByRole('dialog', { name: 'Your cart' })
  await expect(miniCart).toBeVisible()
  await tabTo(page, miniCart.getByRole('link', { name: 'Check out' }))
  await page.keyboard.press('Enter')
  await page.waitForURL('/checkout')

  // Delivery: the saved address is chosen; continue, and focus lands on the review heading.
  await expect(page.getByRole('radio').first()).toBeChecked()
  await tabTo(page, page.getByRole('button', { name: 'Continue to review' }))
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Review and reserve' })).toBeFocused()

  await tabTo(page, page.getByRole('button', { name: 'Place order and pay' }))
  await page.keyboard.press('Enter')
  await page.waitForURL(/\/orders\/FRG-\d+\/pay$/)

  // Pay (the test-mode form) and arrive at the confirmation with its heading focused.
  await tabTo(page, page.getByRole('button', { name: /^Pay N\$ / }))
  await page.keyboard.press('Enter')
  await page.waitForURL(/\/orders\/FRG-\d+\/confirmation$/, { timeout: 60_000 })
  await expect(page.getByRole('heading', { level: 1, name: /Your order is confirmed/ })).toBeFocused()
})
