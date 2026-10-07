// The pure entry fetches Stripe.js only when loadStripe is called. The default entry injects it as
// soon as the module is imported, which put Stripe's third-party cookies on every page.
import type { Stripe } from '@stripe/stripe-js'
import { loadStripe } from '@stripe/stripe-js/pure'

const loaders = new Map<string, Promise<Stripe | null>>()

/** Stripe.js, loaded once per publishable key (from GET /config, never hard-coded). */
export function getStripe(publishableKey: string): Promise<Stripe | null> {
  let loader = loaders.get(publishableKey)
  if (!loader) {
    loader = loadStripe(publishableKey)
    loaders.set(publishableKey, loader)
  }
  return loader
}
