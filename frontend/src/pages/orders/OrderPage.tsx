import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { OrderStatusBadge } from '@/components/ui/OrderStatusBadge'
import { formatPrice } from '@/lib/money'
import { cancelOrder, orderQuery } from '@/orders/api'
import { paymentLabel } from '@/orders/status'
import { useBuyAgain } from '@/orders/useBuyAgain'
import { TotalsTable } from '@/pages/cart/TotalsTable'
import { OrderTimeline } from './OrderTimeline'

const PLACED = new Intl.DateTimeFormat('en-NA', { dateStyle: 'long', timeStyle: 'short' })

/** One of the customer's orders: progress, parts, totals, address and what they can do next. */
export function OrderPage() {
  const { orderNumber = '' } = useParams()
  const order = useQuery(orderQuery(orderNumber))
  const buyAgain = useBuyAgain()
  const queryClient = useQueryClient()
  const [confirmCancel, setConfirmCancel] = useState(false)
  const cancel = useMutation({
    mutationFn: () => cancelOrder(orderNumber),
    onSuccess: (updated) => {
      queryClient.setQueryData(orderQuery(orderNumber).queryKey, updated)
      void queryClient.invalidateQueries({ queryKey: ['orders', 'list'] })
      void queryClient.invalidateQueries({ queryKey: ['builds'] })
      setConfirmCancel(false)
    },
  })

  if (order.isPending) return <p className="text-sm text-ink-muted">Loading</p>
  if (order.isError) return <ErrorMessage error={order.error} />
  const o = order.data
  const address = o.shipping_address

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-sm text-ink-subtle">
        <Link to="/orders" className="hover:text-accent">
          Orders
        </Link>{' '}
        / {o.order_number}
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-semibold">
            Order {o.order_number} <OrderStatusBadge status={o.status} />
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Placed <time dateTime={o.created_at}>{PLACED.format(new Date(o.created_at))}</time>
          </p>
        </div>
        <div className="flex gap-2">
          {o.status === 'pending_payment' ? (
            <>
              <Button asChild>
                <Link to={`/orders/${o.order_number}/pay`}>Pay now</Link>
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setConfirmCancel(true)
                }}
              >
                Cancel order
              </Button>
            </>
          ) : null}
          <Button
            variant="secondary"
            busy={buyAgain.isPending}
            onClick={() => {
              buyAgain.mutate(o.order_number)
            }}
          >
            Buy again
          </Button>
        </div>
      </div>

      <ErrorMessage error={buyAgain.error} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_20rem]">
        <section aria-labelledby="items-heading" className="rounded-md border border-border bg-surface p-5">
          <h2 id="items-heading" className="text-sm font-semibold">
            Parts
          </h2>
          <ul className="mt-3 divide-y divide-border text-sm">
            {o.items.map((item) => (
              <li key={item.product_id} className="flex justify-between gap-4 py-2">
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="font-mono text-xs text-ink-subtle">{item.sku}</p>
                </div>
                <div className="text-right">
                  <p className="tabular">{formatPrice(item.line_total)}</p>
                  <p className="text-xs text-ink-muted tabular">
                    {item.quantity} x {formatPrice(item.unit_price)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-border pt-4">
            <TotalsTable totals={o.totals} />
          </div>
          <p className="mt-3 text-xs text-ink-subtle">Prices are as charged when the order was placed.</p>
        </section>

        <div className="space-y-6">
          <section
            aria-labelledby="progress-heading"
            className="rounded-md border border-border bg-surface p-5"
          >
            <h2 id="progress-heading" className="mb-4 text-sm font-semibold">
              Progress
            </h2>
            <OrderTimeline status={o.status} history={o.history} />
          </section>
          <section
            aria-labelledby="delivery-heading"
            className="space-y-3 rounded-md border border-border bg-surface p-5 text-sm"
          >
            <h2 id="delivery-heading" className="font-semibold">
              Delivery and payment
            </h2>
            {address ? (
              <address className="text-ink-muted not-italic">
                {address.recipient_name}
                <br />
                {address.line1}
                {address.line2 ? (
                  <>
                    <br />
                    {address.line2}
                  </>
                ) : null}
                <br />
                {[address.city, address.region, address.postal_code].filter(Boolean).join(', ')}
                <br />
                {address.country_code}
              </address>
            ) : null}
            <p>
              <span className="text-ink-muted">Payment: </span>
              {paymentLabel(o.payment_status)}
            </p>
            {o.build_id !== null ? (
              <p>
                <span className="text-ink-muted">From a saved build. </span>
                <Link
                  to={`/configurator?build=${String(o.build_id)}`}
                  className="text-accent hover:underline"
                >
                  Open it
                </Link>
              </p>
            ) : null}
          </section>
        </div>
      </div>

      <Dialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={`Cancel order ${o.order_number}?`}
        description="The parts are released straight away and nothing is charged. This cannot be undone."
      >
        <div className="space-y-4">
          <ErrorMessage error={cancel.error} />
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setConfirmCancel(false)
              }}
            >
              Keep the order
            </Button>
            <Button
              variant="danger"
              busy={cancel.isPending}
              onClick={() => {
                cancel.mutate()
              }}
            >
              Cancel order
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
