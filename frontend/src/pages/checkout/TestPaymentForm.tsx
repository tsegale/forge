import { FlaskConical } from 'lucide-react'
import { useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { formatPrice } from '@/lib/money'
import { simulatePayment, type SimulatedOutcome } from '@/payments/simulate'

/**
 * Stand-in for the card form when the store runs the fake payment gateway (development without
 * Stripe keys, and CI). It behaves like the real form: a decline leaves it in place for another
 * try, and success hands over to the same "confirming" step.
 */
export function TestPaymentForm({
  orderNumber,
  total,
  onSubmitted,
}: {
  orderNumber: string
  total: { amount_cents: number; currency: string }
  onSubmitted: () => void
}) {
  const [busy, setBusy] = useState<SimulatedOutcome | null>(null)
  const [declined, setDeclined] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)

  async function pay(outcome: SimulatedOutcome) {
    setBusy(outcome)
    setDeclined(null)
    setError(null)
    try {
      const result = await simulatePayment(orderNumber, outcome)
      if (result.status === 'succeeded') onSubmitted()
      else setDeclined(result.message ?? 'Your card was declined.')
    } catch (caught) {
      setError(caught)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4" aria-label="Test payment" role="group">
      <div className="flex items-start gap-3 rounded-md border border-dashed border-border-strong p-3 text-sm">
        <FlaskConical aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-ink-subtle" />
        <p className="text-ink-muted">
          Test mode: this store uses simulated payments, so no card is needed and nothing is charged.
        </p>
      </div>
      {declined ? (
        <Alert tone="danger" title="Your card was declined">
          {declined} Check the details or try a different card.
        </Alert>
      ) : null}
      <ErrorMessage error={error} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button busy={busy === 'succeeded'} disabled={busy !== null} onClick={() => void pay('succeeded')}>
          Pay {formatPrice(total)}
        </Button>
        <Button
          variant="secondary"
          busy={busy === 'declined'}
          disabled={busy !== null}
          onClick={() => void pay('declined')}
        >
          Simulate a declined card
        </Button>
      </div>
    </div>
  )
}
