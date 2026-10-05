import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { adminOrderQuery } from '@/admin/api'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { OrderStatusBadge } from '@/components/ui/OrderStatusBadge'
import { formatPrice } from '@/lib/money'
import { paymentLabel } from '@/orders/status'
import { TotalsTable } from '@/pages/cart/TotalsTable'
import { OrderTimeline } from '@/pages/orders/OrderTimeline'
import { OrderActions } from './OrderActions'

const PLACED = new Intl.DateTimeFormat('en-NA', { dateStyle: 'long', timeStyle: 'short' })

/** One order as an administrator sees it: customer, progress, parts and the next actions. */
export function AdminOrderPage() {
  const { orderNumber = '' } = useParams()
  const order = useQuery(adminOrderQuery(orderNumber))

  if (order.isPending) return <p className="text-sm text-ink-muted">Loading</p>
  if (order.isError) return <ErrorMessage error={order.error} />
  const o = order.data
  const address = o.shipping_address

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-sm text-ink-subtle">
        <Link to="/admin/orders" className="hover:text-accent">
          Orders
        </Link>{' '}
        / {o.order_number}
      </nav>
      <div>
        <h1 className="flex items-center gap-3 text-2xl font-semibold">
          Order {o.order_number} <OrderStatusBadge status={o.status} />
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          {o.customer_email}, placed{' '}
          <time dateTime={o.created_at}>{PLACED.format(new Date(o.created_at))}</time>
        </p>
      </div>

      <section
        aria-labelledby="actions-heading"
        className="rounded-[var(--radius-card)] border border-border bg-surface p-5"
      >
        <h2 id="actions-heading" className="mb-3 text-sm font-semibold">
          Next step
        </h2>
        <OrderActions
          order={{
            order_number: o.order_number,
            customer_email: o.customer_email,
            next_steps: o.next_steps,
            refundable: o.refundable,
            total: o.totals.total,
          }}
        />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_20rem]">
        <section
          aria-labelledby="admin-items-heading"
          className="rounded-[var(--radius-card)] border border-border bg-surface p-5"
        >
          <h2 id="admin-items-heading" className="text-sm font-semibold">
            Parts
          </h2>
          <ul className="mt-3 divide-y divide-border text-sm">
            {o.items.map((item) => (
              <li key={item.product_id} className="flex justify-between gap-4 py-2">
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="font-mono text-xs text-ink-subtle">{item.sku}</p>
                </div>
                <div className="text-right tabular">
                  <p>{formatPrice(item.line_total)}</p>
                  <p className="text-xs text-ink-muted">
                    {item.quantity} x {formatPrice(item.unit_price)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-border pt-4">
            <TotalsTable totals={o.totals} />
          </div>
        </section>
        <div className="space-y-6">
          <section
            aria-labelledby="admin-progress-heading"
            className="rounded-[var(--radius-card)] border border-border bg-surface p-5"
          >
            <h2 id="admin-progress-heading" className="mb-4 text-sm font-semibold">
              Progress
            </h2>
            <OrderTimeline status={o.status} history={o.history} />
          </section>
          {address ? (
            <section
              aria-labelledby="ship-to-heading"
              className="rounded-[var(--radius-card)] border border-border bg-surface p-5 text-sm"
            >
              <h2 id="ship-to-heading" className="font-semibold">
                Ship to
              </h2>
              <address className="mt-2 text-ink-muted not-italic">
                {address.recipient_name}
                {address.phone ? `, ${address.phone}` : ''}
                <br />
                {address.line1}
                {address.line2 ? `, ${address.line2}` : ''}
                <br />
                {[address.city, address.region, address.postal_code].filter(Boolean).join(', ')},{' '}
                {address.country_code}
              </address>
              <p className="mt-3">
                <span className="text-ink-muted">Payment: </span>
                {paymentLabel(o.payment_status)}
              </p>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  )
}
