import { getAccessToken } from '@/api/client'
import { networkError, toApiError } from '@/api/errors'
import { withSession } from '@/auth/session'

export type SimulatedOutcome = 'succeeded' | 'declined'

export interface SimulationResult {
  status: SimulatedOutcome
  message?: string
}

/**
 * Pay with the fake gateway (development and end-to-end tests): the backend signs a Stripe-shaped
 * webhook and processes it, so the order is paid by the real webhook code. The route is not part
 * of the public API (and so not in the generated client); it exists only with the fake gateway.
 */
export function simulatePayment(orderNumber: string, outcome: SimulatedOutcome) {
  return withSession(async () => {
    const token = getAccessToken()
    let response: Response
    try {
      response = await fetch(`/api/test/payments/${encodeURIComponent(orderNumber)}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ outcome }),
      })
    } catch {
      throw networkError()
    }
    const body: unknown = await response.json().catch(() => null)
    if (!response.ok) throw toApiError(response.status, body, response.headers)
    return body as SimulationResult
  })
}
