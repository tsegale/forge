import type { FullConfig } from '@playwright/test'
import { CPU, ensureStock, PSU } from './support'

/** Once per test run: stock for the parts the specs always buy (see ensureStock). */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL
  if (!baseURL) throw new Error('No baseURL in playwright.config.ts')
  await ensureStock(baseURL, [CPU.slug, PSU.slug])
}
