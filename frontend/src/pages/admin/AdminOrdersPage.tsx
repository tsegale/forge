import { useInfiniteQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'
import { adminOrdersQuery } from '@/admin/api'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { OrderStatusBadge } from '@/components/ui/OrderStatusBadge'
import { formatPrice } from '@/lib/money'
import { STATUS_LABELS, type OrderStatus } from '@/orders/status'
import { OrderActions } from './OrderActions'

const PLACED = new Intl.DateTimeFormat('en-NA', { dateStyle: 'medium', timeStyle: 'short' })
const STATUSES = Object.keys(STATUS_LABELS) as OrderStatus[]

function isStatus(value: string | null): value is OrderStatus {
  return value !== null && (STATUSES as string[]).includes(value)
}

/** Every order, newest first, with the fulfilment and refund actions each one allows now. */
export function AdminOrdersPage() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('status')
  const status = isStatus(raw) ? raw : null
  const orders = useInfiniteQuery(adminOrdersQuery(status))
  const rows = orders.data?.pages.flatMap((page) => page.items) ?? []

  return (
    <section aria-labelledby="admin-orders-heading" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 id="admin-orders-heading" className="text-2xl font-semibold">
          Orders
        </h1>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-ink-muted">Status</span>
          <select
            value={status ?? ''}
            onChange={(event) => {
              setParams(event.target.value ? { status: event.target.value } : {}, { replace: true })
            }}
            className="rounded-md border border-border-strong bg-surface px-3 py-2"
          >
            <option value="">All orders</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ErrorMessage error={orders.error} />
      {orders.isPending ? <p className="text-sm text-ink-muted">Loading</p> : null}
      {orders.isSuccess && rows.length === 0 ? (
        <p className="py-8 text-center text-ink-muted">No orders match.</p>
      ) : null}
      {rows.length ? (
        <div className="relative overflow-x-auto rounded-md border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-canvas text-left text-ink-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  Order
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Customer
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Placed
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Total
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Next step
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((order) => (
                <tr key={order.order_number} className="border-t border-border align-middle">
                  <td className="px-4 py-3 font-medium">
                    <Link to={`/admin/orders/${order.order_number}`} className="text-accent hover:underline">
                      {order.order_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{order.customer_email}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-ink-muted">
                    {PLACED.format(new Date(order.created_at))}
                  </td>
                  <td className="px-4 py-3">
                    <OrderStatusBadge status={order.status} />
                  </td>
                  <td className="px-4 py-3 text-right tabular">{formatPrice(order.total)}</td>
                  <td className="px-4 py-3">
                    <OrderActions order={order} compact />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {orders.hasNextPage ? (
        <Button
          variant="secondary"
          busy={orders.isFetchingNextPage}
          onClick={() => void orders.fetchNextPage()}
        >
          Show older orders
        </Button>
      ) : null}
    </section>
  )
}
