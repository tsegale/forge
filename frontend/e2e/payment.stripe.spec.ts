import { expect, test, type FrameLocator, type Page } from '@playwright/test'
import { cartWithOnly, PSU, placeOrder, signIn } from './support'

// Real Stripe test mode: needs the stack's Stripe test keys and `stripe listen` forwarding webhooks.
test.skip(!process.env.E2E_STRIPE, 'set E2E_STRIPE=1 to run against Stripe test mode')

const DECLINED = '4000000000000002' // Stripe's published test card: generic decline
const VISA = '4242424242424242' // Stripe's published test card: succeeds

// Stripe renders several frames with the same title; the card fields live in the payment one.
function paymentFrame(page: Page): FrameLocator {
  return page.frameLocator('iframe[src*="elements-inner-payment"]')
}

async function enterCard(page: Page, number: string): Promise<void> {
  const frame = paymentFrame(page)
  await frame.locator('input[name="number"]').fill(number)
  await frame.locator('input[name="expiry"]').fill('12 / 34')
  await frame.locator('input[name="cvc"]').fill('123')
  const postal = frame.locator('input[name="postalCode"]')
  if (await postal.isVisible()) await postal.fill('10005')
}

test('a declined card shows a clear retry, and a good card then pays the order', async ({ page }) => {
  await signIn(page)
  await cartWithOnly(page, PSU.slug)
  const orderNumber = await placeOrder(page)
  const pay = page.getByRole('button', { name: /^Pay N\$ / })

  await enterCard(page, DECLINED)
  await pay.click()
  await expect(page.getByRole('alert')).toContainText('Your card was declined')
  await expect(page.getByRole('alert')).toContainText('try a different card')

  await enterCard(page, VISA)
  await pay.click()
  await expect(page.getByText('Confirming your payment')).toBeVisible()
  // Paid only once Stripe's webhook reaches the backend; the page then moves to the order.
  await page.waitForURL(`/orders/${orderNumber}`, { timeout: 60_000 })
})
