import { Bell, BellRing } from 'lucide-react'
import { Link } from 'react-router'
import { useAlerts, useDeleteAlert } from '@/account/api'
import { ProductImage } from '@/components/catalog/ProductImage'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatPrice } from '@/lib/money'
import { usePageTitle } from '@/lib/usePageTitle'

const DATE = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' })

/** The parts the customer is watching, the price they want, and which alerts have fired. */
export function AlertsPage() {
  usePageTitle('Price alerts')
  const alerts = useAlerts()
  const remove = useDeleteAlert()
  const items = alerts.data?.items ?? []

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Price alerts</h1>
        <p className="mt-1 text-base text-ink-muted">
          We email you once when a part reaches your price. Set an alert from any product page.
        </p>
      </div>
      <ErrorMessage error={alerts.error ?? remove.error} />
      {alerts.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : items.length ? (
        <ul className="divide-y divide-border rounded-md border border-border bg-surface">
          {items.map((alert) => {
            const reached = alert.product.price.amount_cents <= alert.target.amount_cents
            return (
              <li
                key={alert.id}
                className="grid grid-cols-[4.5rem_1fr] gap-x-4 gap-y-3 p-4 sm:grid-cols-[5rem_1fr_auto]"
              >
                <ProductImage
                  image={alert.product.image}
                  kind={alert.product.kind}
                  name={alert.product.name}
                  variant="thumb"
                  className="rounded-sm border border-border"
                />
                <div className="min-w-0">
                  <Link
                    to={`/products/${alert.product.slug}`}
                    className="font-medium text-ink hover:text-accent"
                  >
                    {alert.product.name}
                  </Link>
                  <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 text-sm">
                    <dt className="text-ink-muted">Now</dt>
                    <dd className="font-medium text-ink tabular">{formatPrice(alert.product.price)}</dd>
                    <dt className="text-ink-muted">Your price</dt>
                    <dd className="text-ink tabular">{formatPrice(alert.target)}</dd>
                  </dl>
                </div>
                <div className="col-span-2 flex items-center justify-between gap-3 sm:col-span-1 sm:flex-col sm:items-end">
                  {alert.triggered_at ? (
                    <Badge tone="success">
                      <BellRing aria-hidden="true" className="h-3.5 w-3.5" /> Emailed{' '}
                      {DATE.format(new Date(alert.triggered_at))}
                    </Badge>
                  ) : reached ? (
                    <Badge tone="success">Price reached, email on its way</Badge>
                  ) : (
                    <Badge tone="neutral">
                      <Bell aria-hidden="true" className="h-3.5 w-3.5" /> Watching
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Stop watching ${alert.product.name}`}
                    busy={remove.isPending && remove.variables === alert.id}
                    onClick={() => {
                      remove.mutate(alert.id)
                    }}
                  >
                    Stop watching
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <EmptyState
          icon={Bell}
          title="No price alerts"
          action={
            <Button asChild>
              <Link to="/shop">Browse parts</Link>
            </Button>
          }
        >
          <p>On a product page, choose "Notify me when the price drops" and name your price.</p>
        </EmptyState>
      )}
    </div>
  )
}
