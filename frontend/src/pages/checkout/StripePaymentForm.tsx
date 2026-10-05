import { PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { useState, type SyntheticEvent } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { formatPrice } from '@/lib/money'

// Module constant: a new options object on each render would be re-applied to the element.
const ELEMENT_OPTIONS = { layout: 'tabs' } as const

interface Failure {
  title: string
  detail: string
}

/**
 * Card entry and confirmation. Card details go straight from Stripe's iframe to Stripe; this
 * page never sees them. A declined card leaves the form in place, so the customer can correct
 * the details or use another card against the same PaymentIntent.
 */
export function StripePaymentForm({
  total,
  returnUrl,
  onSubmitted,
}: {
  total: { amount_cents: number; currency: string }
  returnUrl: string
  onSubmitted: () => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  async function pay(event: SyntheticEvent) {
    event.preventDefault()
    if (!stripe || !elements) return
    setBusy(true)
    setFailure(null)
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required', // cards confirm in place; redirect methods come back to returnUrl
        confirmParams: { return_url: returnUrl },
      })
      if (error) {
        setFailure(
          error.type === 'card_error'
            ? {
                title: error.code === 'card_declined' ? 'Your card was declined' : 'Payment not completed',
                detail: `${error.message ?? ''} Check the details or try a different card.`.trim(),
              }
            : error.type === 'validation_error'
              ? { title: 'Check your card details', detail: error.message ?? '' }
              : {
                  title: 'Payment could not be completed',
                  detail: 'Nothing was charged. Please try again.',
                },
        )
      } else if (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing') {
        onSubmitted()
      } else {
        setFailure({
          title: 'Payment not completed',
          detail: 'Nothing was charged. Check the details or try a different card.',
        })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(event) => void pay(event)} className="space-y-4" aria-label="Card payment">
      <PaymentElement
        options={ELEMENT_OPTIONS}
        onLoadError={({ error }) => {
          setLoadError(error.message ?? 'Unknown error')
        }}
      />
      {loadError ? (
        <Alert tone="danger" title="The payment form could not be loaded">
          {loadError} Your parts are still reserved; reload the page to try again.
        </Alert>
      ) : null}
      {failure ? (
        <Alert tone="danger" title={failure.title}>
          {failure.detail}
        </Alert>
      ) : null}
      <Button
        type="submit"
        className="w-full"
        busy={busy}
        disabled={!stripe || !elements || loadError !== null}
      >
        {busy ? 'Processing' : `Pay ${formatPrice(total)}`}
      </Button>
    </form>
  )
}
