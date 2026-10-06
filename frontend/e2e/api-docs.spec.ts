import { expect, test, type Page } from '@playwright/test'

/**
 * The API documentation renders under its own Content Security Policy: Swagger UI and Redoc load
 * from a pinned CDN with Subresource Integrity, and nothing the policy or an integrity check
 * blocks may be needed to render them.
 */

function collectProblems(page: Page): string[] {
  const problems: string[] = []
  page.on('console', (message) => {
    const text = message.text()
    if (/Content Security Policy|integrity/i.test(text)) problems.push(text)
  })
  page.on('pageerror', (error) => problems.push(error.message))
  return problems
}

test('Swagger UI at /api/docs renders the Forge API without policy violations', async ({ page }) => {
  const problems = collectProblems(page)
  const response = await page.goto('/api/docs')
  await page.waitForURL('**/api/docs/swagger/')
  expect(response?.headers()['content-security-policy']).toContain("default-src 'none'")
  await expect(page.locator('.swagger-ui .info .title')).toContainText('Forge API')
  await expect(page.getByText('/api/v1/products').first()).toBeVisible()
  expect(problems).toEqual([])
})

test('Redoc renders the reference without policy violations', async ({ page }) => {
  const problems = collectProblems(page)
  await page.goto('/api/docs/redoc/')
  await expect(page.getByRole('heading', { name: /Forge API/ }).first()).toBeVisible({
    timeout: 15_000,
  })
  expect(problems).toEqual([])
})
