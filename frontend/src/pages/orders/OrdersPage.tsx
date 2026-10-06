import { useInfiniteQuery } from '@tanstack/react-query'
import { Package } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { OrderStatusBadge } from '@/components/ui/OrderStatusBadge'
import { formatPrice } from '@/lib/money'
import { ordersQuery } from '@/orders/api'
import { STATUS_LABELS, type OrderStatus } from '@/orders/status'
import { useBuyAgain } from '@/orders/useBuyAgain'

const DATE = new Intl.DateTimeFormat('en-NA', { dateStyle: 'medium' })
const STATUSES = Object.keys(STATUS_LABELS) as OrderStatus[]

function isStatus(value: string | null): value is OrderStatus {
  return value !== null && (STATUSES as string[]).includes(value)
}

/** The customer's order history, newest first, filterable by status. */
export function OrdersPage() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('status')
  const status = isStatus(raw) ? raw : null
  const orders = useInfiniteQuery(ordersQuery(status))
  const buyAgain = useBuyAgain()
  const rows = orders.data?.pages.flatMap((page) => page.items) ?? []

  return (
    <section aria-labelledby="orders-heading">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 id="orders-heading" className="text-2xl font-semibold">
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

      <div className="mt-6 space-y-4">
        <ErrorMessage error={orders.error ?? buyAgain.error} />
        {orders.isPending ? <p className="text-sm text-ink-muted">Loading</p> : null}
        {orders.isSuccess && rows.length === 0 ? (
          <div className="py-12 text-center">
            <Package aria-hidden="true" className="mx-auto h-10 w-10 text-ink-subtle" />
            <p className="mt-3 text-ink-muted">
              {status ? `No orders are ${STATUS_LABELS[status].toLowerCase()}.` : 'No orders yet.'}
            </p>
          </div>
        ) : null}
        {rows.length ? (
          <table className="w-full overflow-hidden rounded-md border border-border bg-surface text-sm">
            <thead className="bg-canvas text-left text-ink-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  Order
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Placed
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Items
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Total
                </th>
                <th scope="col" className="px-4 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((order) => (
                <tr key={order.order_number} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">
                    <Link to={`/orders/${order.order_number}`} className="text-accent hover:underline">
                      {order.order_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{DATE.format(new Date(order.created_at))}</td>
                  <td className="px-4 py-3">
                    <OrderStatusBadge status={order.status} />
                  </td>
                  <td className="px-4 py-3 text-right tabular">{order.item_count}</td>
                  <td className="px-4 py-3 text-right tabular">{formatPrice(order.total)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {order.status === 'pending_payment' ? (
                        <Button asChild>
                          <Link to={`/orders/${order.order_number}/pay`}>Pay</Link>
                        </Button>
                      ) : null}
                      <Button
                        variant="secondary"
                        busy={buyAgain.isPending && buyAgain.variables === order.order_number}
                        aria-label={`Buy order ${order.order_number} again`}
                        onClick={() => {
                          buyAgain.mutate(order.order_number)
                        }}
                      >
                        Buy again
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
      </div>
    </section>
  )
}
