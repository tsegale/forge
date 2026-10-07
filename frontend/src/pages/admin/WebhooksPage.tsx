import { useInfiniteQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { webhooksQuery } from '@/admin/api'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { Skeleton } from '@/components/ui/Skeleton'
import { usePageTitle } from '@/lib/usePageTitle'

const WHEN = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'medium' })

/**
 * Every payment-provider event the store applied, from the idempotency ledger: an event id is
 * recorded once, so a redelivered event is never applied twice.
 */
export function WebhooksPage() {
  usePageTitle('Webhooks')
  const log = useInfiniteQuery(webhooksQuery)
  const items = log.data?.pages.flatMap((page) => page.items) ?? []
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Webhooks</h1>
        <p className="mt-1 text-base text-ink-muted">
          Events from the payment provider, each applied exactly once. A redelivery finds its id here and is
          ignored.
        </p>
      </div>
      <ErrorMessage error={log.error} onRetry={() => void log.refetch()} />
      {log.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-surface">
          <table className="w-full text-sm">
            <caption className="sr-only">Applied webhook events, newest first</caption>
            <thead className="bg-surface-muted text-left text-ink-subtle">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  Received
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Event
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Order
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={`${item.provider}-${item.event_id}`} className="border-t border-border align-top">
                  <td className="px-4 py-2.5 whitespace-nowrap text-ink-muted tabular">
                    {WHEN.format(new Date(item.processed_at))}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="block font-tech text-xs text-ink">{item.event_type}</span>
                    <span className="block font-tech text-xs break-all text-ink-subtle">{item.event_id}</span>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {item.order_number ? (
                      <Link
                        to={`/admin/orders/${item.order_number}`}
                        className="font-tech text-accent hover:underline"
                      >
                        {item.order_number}
                      </Link>
                    ) : (
                      <span className="text-ink-subtle">None</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!items.length ? <p className="p-4 text-sm text-ink-muted">No events received yet.</p> : null}
        </div>
      )}
      {log.hasNextPage ? (
        <Button
          variant="secondary"
          className="self-start"
          busy={log.isFetchingNextPage}
          onClick={() => void log.fetchNextPage()}
        >
          Show older events
        </Button>
      ) : null}
    </div>
  )
}
