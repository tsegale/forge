import { expect, test, type Page } from '@playwright/test'
import { admin, CPU, expectAccessible, payOnPayScreen, signIn } from './support'

/**
 * The presentation demo, end to end: browse and search, configure a build with live
 * compatibility, validate, check out, pay, see the order, and fulfil it as an administrator.
 * Every screen on the way is checked with axe.
 */

// What a build around that CPU still needs (it has integrated graphics but no cooler in the box).
const STILL_NEEDED = [
  'motherboard',
  'memory kit',
  'storage drive',
  'power supply',
  'case',
  'CPU cooler',
] as const

/** Choose the first compatible, in-stock part the picker offers for one component kind. */
async function chooseFirst(page: Page, kind: string): Promise<void> {
  await page.getByRole('button', { name: `Choose ${kind}`, exact: true }).click()
  const dialog = page.getByRole('dialog', { name: `Choose ${kind}` })
  await expect(dialog).toContainText('Only parts that work with the rest of your build are listed.')
  const option = dialog.getByRole('button', { name: /^(Select|Add) / }).first()
  await option.click()
  await expect(dialog).toBeHidden()
}

test('the demo path: browse, configure, validate, check out, pay, fulfil', async ({ page }) => {
  test.setTimeout(180_000) // the whole store end to end, with axe on every screen
  await signIn(page)

  // Browse and search.
  await expectAccessible(page, 'catalog')
  const search = page.getByRole('combobox', { name: 'Search products' }).filter({ visible: true })
  await search.fill(CPU.search)
  await search.press('Enter')
  await page.waitForURL(/\/search\?q=/)
  const results = page.getByRole('region', { name: 'Results' })
  await results.getByRole('link', { name: CPU.name }).click()
  await page.waitForURL(`/products/${CPU.slug}`)
  await expect(page.getByRole('heading', { level: 1, name: CPU.name })).toBeVisible()
  await expectAccessible(page, 'product page')

  // Configure: start from the CPU, then let the compatible-only pickers narrow every part.
  await page.getByRole('button', { name: 'Add to build' }).click()
  await page.waitForURL('/configurator')
  await expect(page.getByText(/^Still needed:/)).toContainText('Motherboard')
  await expectAccessible(page, 'configurator')
  await page.getByRole('button', { name: 'Choose motherboard', exact: true }).click()
  await expectAccessible(page, 'part picker')
  await page.keyboard.press('Escape')
  for (const kind of STILL_NEEDED) await chooseFirst(page, kind)
  await expect(page.getByText('Compatible and complete')).toBeVisible()

  // Validate, then check the build out.
  await page.getByRole('button', { name: 'Validate' }).click()
  // Saving the parts and validating is several requests; slow machines need longer than the default.
  await expect(page.getByRole('status').filter({ hasText: 'Validated' })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('link', { name: 'Check out this build' }).click()
  await page.waitForURL(/\/checkout\?build=\d+$/)
  await expect(page.getByRole('radio').first()).toBeChecked() // the demo customer's saved address
  await expectAccessible(page, 'checkout delivery')
  await page.getByRole('button', { name: 'Continue to review' }).click()
  await expect(page.getByRole('heading', { name: 'Review and reserve' })).toBeFocused()
  await expectAccessible(page, 'checkout review')
  await page.getByRole('button', { name: 'Place order and pay' }).click()

  // Pay.
  await page.waitForURL(/\/orders\/FRG-\d+\/pay$/)
  const orderNumber = /FRG-\d+/.exec(page.url())?.[0] ?? ''
  await expect(page.getByRole('timer', { name: 'Time left to pay' })).toBeVisible()
  await expectAccessible(page, 'pay screen')
  await payOnPayScreen(page)
  await page.waitForURL(`/orders/${orderNumber}/confirmation`, { timeout: 60_000 })
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your order is confirmed')
  await expect(page.getByText(/Payment received/)).toBeVisible()
  await expectAccessible(page, 'confirmation')
  await page.getByRole('link', { name: 'View order' }).click()
  await page.waitForURL(`/orders/${orderNumber}`)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Paid')
  await expectAccessible(page, 'order detail')

  // Order history.
  await page.goto('/orders')
  await expect(page.getByRole('row', { name: new RegExp(orderNumber) })).toContainText('Paid')
  await expectAccessible(page, 'order history')

  // Fulfil it as an administrator, one legal step at a time.
  await signIn(page, '/admin/orders', admin)
  const row = page.getByRole('row', { name: new RegExp(orderNumber) })
  await expectAccessible(page, 'admin orders')
  for (const [action, status] of [
    ['Start fulfilment', 'Being prepared'],
    ['Mark shipped', 'Shipped'],
    ['Mark delivered', 'Delivered'],
  ] as const) {
    await row.getByRole('button', { name: `${action} for ${orderNumber}` }).click()
    await expect(row).toContainText(status)
  }
  await expect(row.getByRole('button', { name: /^(Start fulfilment|Mark) / })).toHaveCount(0)

  await row.getByRole('link', { name: orderNumber }).click()
  const progress = page.getByRole('list', { name: 'Order progress' })
  await expect(progress.getByRole('listitem')).toHaveCount(5)
  await expect(progress.locator('[aria-current="step"]')).toContainText('Delivered')
  await expectAccessible(page, 'admin order detail')

  await page
    .getByRole('navigation', { name: 'Administration' })
    .getByRole('link', { name: 'Inventory' })
    .click()
  await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible()
  await expect(page.getByRole('table')).toBeVisible()
  await expectAccessible(page, 'admin inventory')

  // The dashboard counts the order; the audit log shows who moved it.
  const admin_nav = page.getByRole('navigation', { name: 'Administration' })
  await admin_nav.getByRole('link', { name: 'Dashboard' }).click()
  await expect(page.getByRole('img', { name: /Revenue per day/ })).toBeVisible()
  await expectAccessible(page, 'admin dashboard')
  await admin_nav.getByRole('link', { name: 'Audit log' }).click()
  await expect(
    page.getByRole('row', { name: new RegExp(`${orderNumber}.*Shipped to delivered`, 'i') }),
  ).toBeVisible()
  await expectAccessible(page, 'admin audit log')
})
