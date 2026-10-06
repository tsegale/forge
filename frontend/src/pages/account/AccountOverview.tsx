import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Bell, Layers, Package } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useAlerts } from '@/account/api'
import { useAuth } from '@/auth/context'
import { buildsQuery } from '@/builds/api'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { OrderStatusBadge } from '@/components/ui/OrderStatusBadge'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatPrice } from '@/lib/money'
import { usePageTitle } from '@/lib/usePageTitle'
import { ordersQuery } from '@/orders/api'

const DATE = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' })

function Tile({
  icon: Icon,
  label,
  value,
  to,
}: {
  icon: typeof Package
  label: string
  value: ReactNode
  to: string
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-4 rounded-md border border-border bg-surface p-4 hover:border-ink-subtle"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Icon aria-hidden="true" className="h-5 w-5" />
      </span>
      <span>
        <span className="block text-2xl font-semibold text-ink tabular">{value}</span>
        <span className="block text-sm text-ink-muted">{label}</span>
      </span>
    </Link>
  )
}

/** The account at a glance: recent orders, and counts that lead to each section. */
export function AccountOverview() {
  usePageTitle('Your account')
  const { user } = useAuth()
  const orders = useInfiniteQuery(ordersQuery(null))
  const builds = useQuery(buildsQuery)
  const alerts = useAlerts()
  const recent = orders.data?.pages[0]?.items.slice(0, 3) ?? []
  const watching = alerts.data?.items.filter((a) => a.triggered_at === null).length

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Hello{user ? `, ${user.first_name}` : ''}
        </h1>
        <p className="mt-1 text-base text-ink-muted">Your orders, builds and alerts in one place.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile
          icon={Package}
          label="Orders"
          to="/orders"
          value={
            orders.data
              ? `${String(orders.data.pages[0]?.items.length ?? 0)}${orders.hasNextPage ? '+' : ''}`
              : '-'
          }
        />
        <Tile icon={Layers} label="Saved builds" to="/builds" value={builds.data?.items.length ?? '-'} />
        <Tile icon={Bell} label="Price alerts watching" to="/account/alerts" value={watching ?? '-'} />
      </div>

      <section aria-labelledby="recent-heading">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="recent-heading" className="text-lg font-semibold text-ink">
            Recent orders
          </h2>
          <Link to="/orders" className="text-sm font-medium text-accent hover:underline">
            All orders
          </Link>
        </div>
        <ErrorMessage error={orders.error} />
        {orders.isPending ? (
          <Skeleton className="mt-3 h-32 w-full" />
        ) : recent.length ? (
          <ul className="mt-3 divide-y divide-border rounded-md border border-border bg-surface">
            {recent.map((order) => (
              <li key={order.order_number} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <Link
                    to={`/orders/${order.order_number}`}
                    className="font-tech font-medium text-accent hover:underline"
                  >
                    {order.order_number}
                  </Link>
                  <p className="text-sm text-ink-muted">
                    {DATE.format(new Date(order.created_at))}, {order.item_count}{' '}
                    {order.item_count === 1 ? 'item' : 'items'}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <OrderStatusBadge status={order.status} />
                  <span className="text-base font-semibold text-ink tabular">{formatPrice(order.total)}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-3 rounded-md border border-dashed border-border-strong p-6 text-center">
            <p className="text-base text-ink-muted">No orders yet.</p>
            <Button asChild className="mt-4">
              <Link to="/configurator">Build a PC</Link>
            </Button>
          </div>
        )}
      </section>
    </div>
  )
}
