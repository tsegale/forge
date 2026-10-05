import { expect, test } from '@playwright/test'
import { cartWithOnly, PSU, placeOrder, signIn } from './support'

const HOLD_MS = 15 * 60_000

test('an expired reservation offers a fresh checkout with the same parts', async ({ page }) => {
  await page.clock.install()
  await signIn(page)
  await cartWithOnly(page, PSU.slug)
  const orderNumber = await placeOrder(page)
  await expect(page.getByRole('timer', { name: 'Time left to pay' })).toBeVisible()

  // Let the hold run out on the customer's clock; the page must stop offering payment.
  await page.clock.fastForward(HOLD_MS + 5_000)
  await expect(page.getByRole('heading', { name: 'Your reservation has expired' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Pay / })).toHaveCount(0)

  await page.getByRole('button', { name: 'Start a fresh checkout' }).click()
  await page.waitForURL('/cart')
  await expect(page.getByRole('main').getByRole('link', { name: PSU.name })).toBeVisible()

  // The old order released its stock and can no longer be paid.
  await page.goto(`/orders/${orderNumber}/pay`)
  await expect(
    page.getByRole('heading', { name: /Your reservation has expired|This order was cancelled/ }),
  ).toBeVisible()
})
