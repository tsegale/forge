import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { metricsQuery } from '@/admin/api'
import { BarChart } from '@/components/charts/BarChart'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { OrderStatusBadge } from '@/components/ui/OrderStatusBadge'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/cn'
import { formatCents, formatPrice } from '@/lib/money'
import { usePageTitle } from '@/lib/usePageTitle'

const PERIODS = [7, 30, 90] as const
const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })

function Kpi({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tracking-tight text-ink tabular">{value}</dd>
      {note ? <dd className="mt-0.5 text-sm text-ink-subtle">{note}</dd> : null}
    </div>
  )
}

function Panel({
  id,
  title,
  children,
  action,
}: {
  id: string
  title: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <section aria-labelledby={id} className="rounded-md border border-border bg-surface p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 id={id} className="text-base font-semibold text-ink">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** The shop at a glance: sales, what needs attention (stock, unpaid orders), and best sellers. */
export function DashboardPage() {
  usePageTitle('Dashboard')
  const [days, setDays] = useState<number>(30)
  const metrics = useQuery(metricsQuery(days))
  const m = metrics.data

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Dashboard</h1>
          <p className="mt-1 text-base text-ink-muted">Paid orders, VAT included. Refreshes every minute.</p>
        </div>
        <div role="group" aria-label="Period" className="flex rounded-md border border-control p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={days === p}
              onClick={() => {
                setDays(p)
              }}
              className={cn(
                'h-8 rounded-sm px-3 text-sm',
                days === p ? 'bg-accent-soft font-medium text-accent' : 'text-ink-muted hover:text-ink',
              )}
            >
              {p} days
            </button>
          ))}
        </div>
      </div>

      <ErrorMessage error={metrics.error} onRetry={() => void metrics.refetch()} />
      {!m ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy="true">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Revenue" value={formatPrice(m.revenue)} note={`${String(m.orders)} paid orders`} />
            <Kpi label="Average order" value={m.average_order ? formatPrice(m.average_order) : 'None yet'} />
            <Kpi label="Units sold" value={m.units} />
            <Kpi
              label="Awaiting payment"
              value={m.awaiting_payment}
              note={m.refunded.amount_cents ? `${formatPrice(m.refunded)} refunded` : 'No refunds'}
            />
          </dl>

          <Panel id="revenue-heading" title="Revenue per day">
            <BarChart
              title={`Revenue per day, last ${String(days)} days`}
              summary={`${formatPrice(m.revenue)} from ${String(m.orders)} orders over ${String(days)} days.`}
              formatValue={(cents) => formatCents(cents)}
              bars={m.daily.map((d, i) => ({
                label: DAY.format(new Date(`${d.day}T12:00:00`)),
                tick:
                  i % Math.ceil(m.daily.length / 7) === 0 ? DAY.format(new Date(`${d.day}T12:00:00`)) : '',
                value: d.revenue.amount_cents,
              }))}
            />
          </Panel>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Panel
              id="stock-heading"
              title="Low stock"
              action={
                <Link to="/admin/inventory" className="text-sm font-medium text-accent hover:underline">
                  Inventory
                </Link>
              }
            >
              {m.low_stock.length ? (
                <table className="w-full text-sm">
                  <caption className="sr-only">Products with three or fewer available</caption>
                  <thead>
                    <tr className="border-b border-border text-left text-ink-subtle">
                      <th scope="col" className="py-2 font-medium">
                        Product
                      </th>
                      <th scope="col" className="py-2 text-right font-medium">
                        Available
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.low_stock.map((row) => (
                      <tr key={row.product_id} className="border-b border-border last:border-0">
                        <td className="py-2">
                          <span className="block text-ink">{row.name}</span>
                          <span className="block font-tech text-xs text-ink-subtle">{row.sku}</span>
                        </td>
                        <td
                          className={cn(
                            'py-2 text-right font-medium tabular',
                            row.available <= 0 ? 'text-danger-ink' : 'text-warning-ink',
                          )}
                        >
                          {row.available}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-ink-muted">Everything has more than three available.</p>
              )}
            </Panel>

            <Panel id="top-heading" title="Best sellers">
              {m.top_products.length ? (
                <ol className="flex flex-col gap-2 text-sm">
                  {m.top_products.map((p, i) => (
                    <li key={p.product_id} className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0">
                        <span className="mr-2 font-tech text-ink-subtle">{i + 1}</span>
                        <span className="text-ink">{p.name}</span>
                        <span className="ml-2 text-ink-subtle tabular">x {p.units}</span>
                      </span>
                      <span className="shrink-0 font-medium text-ink tabular">{formatPrice(p.revenue)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-ink-muted">No paid orders in this period.</p>
              )}
            </Panel>
          </div>

          <Panel
            id="status-heading"
            title="Orders by status"
            action={
              <Link to="/admin/orders" className="text-sm font-medium text-accent hover:underline">
                All orders
              </Link>
            }
          >
            <ul className="flex flex-wrap gap-x-6 gap-y-3">
              {m.by_status.map((s) => (
                <li key={s.status} className="flex items-center gap-2">
                  <OrderStatusBadge status={s.status} />
                  <span className="font-medium text-ink tabular">{s.count}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </>
      )}
    </div>
  )
}
