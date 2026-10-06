import { Elements } from '@stripe/react-stripe-js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Clock, LoaderCircle, Lock, MapPin } from 'lucide-react'
import { memo, useCallback, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router'
import { ApiError } from '@/api/errors'
import { configQuery } from '@/app/config'
import { shouldRetry } from '@/app/queryClient'
import { useSetCart } from '@/cart/api'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { Skeleton } from '@/components/ui/Skeleton'
import { Stepper } from '@/components/ui/Stepper'
import { usePageTitle } from '@/lib/usePageTitle'
import { formatAddress } from '@/orders/address'
import { useExpired } from '@/lib/useExpired'
import { useNow } from '@/lib/useNow'
import { cancelOrder, orderQuery, reorder, startPayment, type OrderDetail } from '@/orders/api'
import { getStripe } from '@/payments/stripe'
import { TotalsTable } from '@/pages/cart/TotalsTable'
import { OrderSummary } from './OrderSummary'
import { CHECKOUT_STEPS } from './steps'
import { StripePaymentForm } from './StripePaymentForm'
import { TestPaymentForm } from './TestPaymentForm'

const CONFIRM_POLL_MS = 2000
/** After this long without the webhook, say so rather than spin indefinitely. */
const CONFIRM_PATIENCE_MS = 60_000
const PAID_STATES = new Set(['paid', 'fulfilling', 'shipped', 'delivered', 'refunded'])

/**
 * Stripe's Appearance API, set to the design tokens (tokens.css) so the card form reads as part of
 * the page. The iframe cannot load the self-hosted Inter, so it uses the system UI font.
 */
const APPEARANCE = {
  theme: 'stripe' as const,
  variables: {
    colorPrimary: '#1e4fa8',
    colorText: '#18181b',
    colorTextSecondary: '#52525b',
    colorTextPlaceholder: '#6b6b74',
    colorDanger: '#b91c1c',
    colorBackground: '#ffffff',
    borderRadius: '4px',
    spacingUnit: '4px',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    fontSizeBase: '15px',
  },
  rules: {
    '.Input': { border: '1px solid #8c8c95', boxShadow: 'none' },
    '.Input:hover': { borderColor: '#6b6b74' },
    '.Input:focus': { borderColor: '#1e4fa8', boxShadow: '0 0 0 3px rgba(30, 79, 168, 0.2)' },
    '.Input--invalid': { borderColor: '#b91c1c', boxShadow: '0 0 0 1px #b91c1c' },
    '.Label': { fontWeight: '500', color: '#18181b' },
    '.Tab': { border: '1px solid #e4e4e7', boxShadow: 'none' },
    '.Tab--selected': { borderColor: '#1e4fa8', boxShadow: '0 0 0 1px #1e4fa8' },
  },
}

function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${String(Math.floor(total / 60))}:${String(total % 60).padStart(2, '0')}`
}

/**
 * Pay for an order. Stock is already reserved; the order becomes paid only when Stripe's webhook
 * reaches the backend, so after confirming, this page polls the order until it says paid.
 */
export function PayPage() {
  const { orderNumber = '' } = useParams()
  const [params] = useSearchParams()
  usePageTitle('Payment')
  // Back from a redirect-based payment method (or 3-D Secure redirect).
  const returned = params.get('redirect_status')
  const [submittedAt, setSubmittedAt] = useState<number | null>(() =>
    returned === 'succeeded' || returned === 'processing' ? Date.now() : null,
  )
  const confirming = submittedAt !== null
  const onSubmitted = useCallback(() => {
    setSubmittedAt(Date.now())
  }, [])

  const order = useQuery({
    ...orderQuery(orderNumber),
    refetchInterval: confirming ? CONFIRM_POLL_MS : false,
  })
  const config = useQuery(configQuery)
  const pending = order.data?.status === 'pending_payment'
  // Changes once, when the hold runs out: the page itself never re-renders on the clock, so the
  // Stripe Elements subtree is left alone while the customer types.
  const expired = useExpired(order.data?.reservation_expires_at)
  const payment = useQuery({
    queryKey: ['payment', orderNumber],
    queryFn: () => startPayment(orderNumber),
    // With the fake gateway this still starts a (simulated) intent, which the simulator pays.
    enabled:
      pending &&
      !expired &&
      !confirming &&
      (config.data?.payment_provider === 'fake' || Boolean(config.data?.stripe_publishable_key)),
    staleTime: Infinity,
    retry: shouldRetry,
  })

  if (order.isPending || config.isPending) return <p className="text-sm text-ink-muted">Loading</p>
  if (order.isError) return <ErrorMessage error={order.error} />
  if (config.isError) return <ErrorMessage error={config.error} />
  const o = order.data

  if (PAID_STATES.has(o.status)) {
    return <Navigate to={`/orders/${o.order_number}${confirming ? '/confirmation' : ''}`} replace />
  }
  if (o.status === 'cancelled' || (pending && expired && !confirming)) {
    return <Expired order={o} cancelled={o.status === 'cancelled' && !expired} />
  }

  const key = config.data.stripe_publishable_key
  const simulated = config.data.payment_provider === 'fake'

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 id="pay-heading" className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Payment
        </h1>
        <p className="mt-1 text-base text-ink-muted">Order {o.order_number}</p>
        <Stepper className="mt-5" label="Checkout progress" steps={CHECKOUT_STEPS} current="payment" />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section aria-labelledby="pay-heading" className="order-2 flex flex-col gap-5 lg:order-1">
          {confirming ? (
            <Confirming submittedAt={submittedAt} orderNumber={o.order_number} />
          ) : (
            <>
              <Countdown expiresAt={o.reservation_expires_at} />
              <div className="rounded-md border border-border bg-surface p-5 sm:p-6">
                {!simulated && !key ? (
                  <Alert tone="warning" title="Online payment is not available">
                    Card payments are not configured for this store.
                  </Alert>
                ) : payment.isPending ? (
                  <div className="flex flex-col gap-3" aria-busy="true">
                    <p className="text-sm text-ink-muted">Preparing secure payment</p>
                    <Skeleton className="h-11 w-full" />
                    <Skeleton className="h-11 w-full" />
                  </div>
                ) : payment.isError || !payment.data.client_secret ? (
                  <div className="flex flex-col gap-3">
                    <ErrorMessage
                      error={payment.error}
                      title="Payment could not be started. Your parts are still reserved."
                    />
                    <Button
                      variant="secondary"
                      className="self-start"
                      busy={payment.isFetching}
                      onClick={() => void payment.refetch()}
                    >
                      Try again
                    </Button>
                  </div>
                ) : simulated ? (
                  <TestPaymentForm
                    orderNumber={o.order_number}
                    total={o.totals.total}
                    onSubmitted={onSubmitted}
                  />
                ) : (
                  <PaymentPanel
                    publishableKey={key ?? ''}
                    clientSecret={payment.data.client_secret}
                    total={o.totals.total}
                    orderNumber={o.order_number}
                    onSubmitted={onSubmitted}
                  />
                )}
              </div>
              {simulated ? null : (
                <p className="flex items-center gap-2 text-sm text-ink-subtle">
                  <Lock aria-hidden="true" className="h-4 w-4" />
                  Payments are processed by Stripe. Card details never reach Forge.
                </p>
              )}
            </>
          )}
        </section>

        <div className="order-1 lg:order-2">
          <OrderSummary
            lines={o.items.map((item) => ({
              key: item.product_id,
              name: item.name,
              kind: item.kind,
              image: item.image,
              quantity: item.quantity,
              lineTotal: item.line_total,
            }))}
            total={o.totals.total}
            totals={<TotalsTable totals={o.totals} />}
          >
            {o.shipping_address ? (
              <div className="flex items-start gap-2 text-sm">
                <MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-ink-subtle" />
                <p>
                  <span className="font-medium text-ink">
                    Delivering to {o.shipping_address.recipient_name}
                  </span>
                  <span className="block text-ink-muted">{formatAddress(o.shipping_address)}</span>
                </p>
              </div>
            ) : null}
          </OrderSummary>
        </div>
      </div>
    </div>
  )
}

/**
 * Stripe Elements with options that keep their identity across renders: Elements re-applies any
 * changed options to the mounted element, so new objects on every render keep it reloading.
 */
const PaymentPanel = memo(function PaymentPanel({
  publishableKey,
  clientSecret,
  total,
  orderNumber,
  onSubmitted,
}: {
  publishableKey: string
  clientSecret: string
  total: { amount_cents: number; currency: string }
  orderNumber: string
  onSubmitted: () => void
}) {
  const options = useMemo(() => ({ clientSecret, appearance: APPEARANCE }), [clientSecret])
  return (
    <Elements stripe={getStripe(publishableKey)} options={options}>
      <StripePaymentForm
        total={total}
        returnUrl={`${globalThis.location.origin}/orders/${orderNumber}/pay`}
        onSubmitted={onSubmitted}
      />
    </Elements>
  )
})

function Countdown({ expiresAt }: { expiresAt: string | null }) {
  const now = useNow()
  if (!expiresAt) return null
  const ms = Date.parse(expiresAt) - now
  const urgent = ms < 2 * 60_000
  return (
    <div
      className={clsx(
        'flex items-center gap-3 rounded-md border p-3 text-sm',
        urgent ? 'border-warning/30 bg-warning-soft' : 'border-border bg-surface',
      )}
    >
      <Clock
        aria-hidden="true"
        className={clsx('h-4 w-4', urgent ? 'text-warning-ink' : 'text-ink-subtle')}
      />
      <p>
        Your parts are reserved for{' '}
        <span className="font-semibold tabular" role="timer" aria-label="Time left to pay">
          {formatClock(ms)}
        </span>
        . Complete payment before the reservation ends.
      </p>
    </div>
  )
}

function Confirming({ submittedAt, orderNumber }: { submittedAt: number; orderNumber: string }) {
  const slow = useNow(5000) - submittedAt > CONFIRM_PATIENCE_MS
  return (
    <div className="rounded-md border border-border bg-surface p-6" aria-live="polite">
      <p className="flex items-center gap-2 font-medium">
        <LoaderCircle aria-hidden="true" className="h-5 w-5 animate-spin text-accent" />
        Confirming your payment
      </p>
      <p className="mt-2 text-sm text-ink-muted">
        Your card was accepted. We are waiting for the payment provider to confirm it, which usually takes a
        few seconds.
      </p>
      {slow ? (
        <div className="mt-4">
          <Alert tone="info" title="This is taking longer than usual">
            You do not need to pay again. We will email you as soon as the payment is confirmed, and the order
            will show as paid in{' '}
            <Link to={`/orders/${orderNumber}`} className="font-medium text-accent hover:underline">
              your orders
            </Link>
            .
          </Alert>
        </div>
      ) : null}
    </div>
  )
}

/** The hold ended (or the order was cancelled): offer to start again with the same parts. */
function Expired({ order, cancelled }: { order: OrderDetail; cancelled: boolean }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const setCart = useSetCart()
  const restart = useMutation({
    mutationFn: async () => {
      if (order.status === 'pending_payment') {
        try {
          // Release the hold now rather than waiting for the sweeper, and unlock the build.
          await cancelOrder(order.order_number)
        } catch (error) {
          // Already cancelled (by the sweeper, or another tab): nothing left to release.
          if (!(error instanceof ApiError && error.status === 409)) throw error
        }
      }
      if (order.build_id !== null) {
        void queryClient.invalidateQueries({ queryKey: ['builds'] })
        return { to: `/checkout?build=${String(order.build_id)}`, unavailable: 0 }
      }
      const cart = await reorder(order.order_number)
      setCart(cart)
      return { to: '/cart', unavailable: cart.unavailable_product_ids.length }
    },
    onSuccess: ({ to, unavailable }) => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
      void navigate(to, { state: { cartNotice: { unavailable } } })
    },
  })

  return (
    <section className="mx-auto max-w-lg py-12 text-center" aria-labelledby="expired-heading">
      <Clock aria-hidden="true" className="mx-auto h-10 w-10 text-ink-subtle" />
      <h1 id="expired-heading" className="mt-4 text-2xl font-semibold">
        {cancelled ? 'This order was cancelled' : 'Your reservation has expired'}
      </h1>
      <p className="mt-2 text-ink-muted">
        {cancelled
          ? 'Nothing was charged and the parts were released.'
          : 'Payment was not completed in time, so the parts were released for other customers. Nothing was charged.'}
      </p>
      <div className="mt-6 flex flex-col items-center gap-3">
        <Button
          busy={restart.isPending}
          onClick={() => {
            restart.mutate()
          }}
        >
          Start a fresh checkout
        </Button>
        <Link to={`/orders/${order.order_number}`} className="text-sm text-accent hover:underline">
          View order {order.order_number}
        </Link>
      </div>
      <div className="mt-4 text-left">
        <ErrorMessage error={restart.error} />
      </div>
    </section>
  )
}
