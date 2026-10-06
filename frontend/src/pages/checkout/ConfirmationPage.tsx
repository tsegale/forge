import { useQuery } from '@tanstack/react-query'
import { CircleCheck, Mail, MapPin, Package, Truck } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { useAuth } from '@/auth/context'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { Skeleton } from '@/components/ui/Skeleton'
import { Stepper } from '@/components/ui/Stepper'
import { usePageTitle } from '@/lib/usePageTitle'
import { formatAddress } from '@/orders/address'
import { orderQuery } from '@/orders/api'
import { TotalsTable } from '@/pages/cart/TotalsTable'
import { OrderSummary } from './OrderSummary'
import { CHECKOUT_STEPS } from './steps'

const PAID = new Set(['paid', 'fulfilling', 'shipped', 'delivered'])
const PLACED = new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeStyle: 'short' })

const NEXT = [
  { icon: Mail, title: 'Confirmation email', text: 'A receipt with these details is on its way to you.' },
  {
    icon: Package,
    title: 'Picked and packed',
    text: 'We check every part against the order before it is boxed.',
  },
  { icon: Truck, title: 'Dispatched by courier', text: 'You can follow each step from your order page.' },
]

/**
 * After a confirmed payment: the order number, what was bought, where it is going and what happens
 * next. Only for paid orders; anything else goes to the order page, which explains its state.
 */
export function ConfirmationPage() {
  const { orderNumber = '' } = useParams()
  const { user } = useAuth()
  const order = useQuery(orderQuery(orderNumber))
  const heading = useRef<HTMLHeadingElement>(null)
  usePageTitle(`Order ${orderNumber} confirmed`)

  const ready = Boolean(order.data)
  useEffect(() => {
    if (ready) heading.current?.focus()
  }, [ready])

  if (order.isError) return <ErrorMessage error={order.error} onRetry={() => void order.refetch()} />
  if (!order.data) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }
  const o = order.data
  if (!PAID.has(o.status)) return <Navigate to={`/orders/${o.order_number}`} replace />

  return (
    <div className="flex flex-col gap-6">
      <Stepper label="Checkout progress" steps={CHECKOUT_STEPS} current="confirmation" />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex flex-col gap-6">
          <section
            aria-labelledby="confirmed-heading"
            className="rounded-md border border-success/40 bg-surface p-6"
          >
            <CircleCheck aria-hidden="true" className="h-10 w-10 text-success-ink" strokeWidth={1.75} />
            <h1
              id="confirmed-heading"
              ref={heading}
              tabIndex={-1}
              className="mt-3 text-2xl font-semibold tracking-tight text-ink focus:outline-none sm:text-3xl"
            >
              Thank you{user ? `, ${user.first_name}` : ''}. Your order is confirmed.
            </h1>
            <p className="mt-2 text-base text-ink-muted">
              Order <span className="font-tech font-medium text-ink">{o.order_number}</span>, placed{' '}
              <time dateTime={o.created_at}>{PLACED.format(new Date(o.created_at))}</time>. Payment received.
            </p>
            {user ? (
              <p className="mt-1 text-base text-ink-muted">
                We have emailed a receipt to <span className="font-medium text-ink">{user.email}</span>.
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild>
                <Link to={`/orders/${o.order_number}`}>View order</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link to="/shop">Continue shopping</Link>
              </Button>
            </div>
          </section>

          {o.shipping_address ? (
            <section
              aria-labelledby="ship-heading"
              className="rounded-md border border-border bg-surface p-5"
            >
              <h2 id="ship-heading" className="flex items-center gap-2 text-base font-semibold text-ink">
                <MapPin aria-hidden="true" className="h-4 w-4 text-ink-subtle" /> Delivering to
              </h2>
              <p className="mt-2 text-sm text-ink">{o.shipping_address.recipient_name}</p>
              <p className="text-sm text-ink-muted">{formatAddress(o.shipping_address)}</p>
            </section>
          ) : null}

          <section aria-labelledby="next-heading" className="rounded-md border border-border bg-surface p-5">
            <h2 id="next-heading" className="text-base font-semibold text-ink">
              What happens next
            </h2>
            <ol className="mt-4 flex flex-col gap-4">
              {NEXT.map(({ icon: Icon, title, text }, index) => (
                <li key={title} className="flex gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                    <Icon aria-hidden="true" className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-ink">
                      <span className="sr-only">Step {index + 1}: </span>
                      {title}
                    </p>
                    <p className="text-sm text-ink-muted">{text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

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
        />
      </div>
    </div>
  )
}
