import { loadStripe, type Stripe } from '@stripe/stripe-js'

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
