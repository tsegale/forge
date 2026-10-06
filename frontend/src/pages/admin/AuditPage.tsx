import { useInfiniteQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { auditQuery, type AuditKind } from '@/admin/api'
import { Badge, type Tone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/cn'
import { usePageTitle } from '@/lib/usePageTitle'

const WHEN = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'medium' })
const KINDS: { value: AuditKind | null; label: string }[] = [
  { value: null, label: 'Everything' },
  { value: 'orders', label: 'Order status' },
  { value: 'payments', label: 'Payments' },
  { value: 'stock', label: 'Stock' },
  { value: 'prices', label: 'Prices' },
]
const TONE: Record<AuditKind, Tone> = {
  orders: 'accent',
  payments: 'success',
  stock: 'warning',
  prices: 'neutral',
}
const LABEL: Record<AuditKind, string> = {
  orders: 'Order',
  payments: 'Payment',
  stock: 'Stock',
  prices: 'Price',
}

/**
 * One trail over the database's own logs: order status changes, payment events, stock changes and
 * price changes, each written by a trigger or append-only table, newest first, with who did it.
 */
export function AuditPage() {
  usePageTitle('Audit log')
  const [kind, setKind] = useState<AuditKind | null>(null)
  const log = useInfiniteQuery(auditQuery(kind))
  const items = log.data?.pages.flatMap((page) => page.items) ?? []

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Audit log</h1>
        <p className="mt-1 text-base text-ink-muted">
          Written by the database (triggers and append-only tables), so every change is here whatever made it.
        </p>
      </div>
      <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <button
            key={k.label}
            type="button"
            aria-pressed={kind === k.value}
            onClick={() => {
              setKind(k.value)
            }}
            className={cn(
              'h-8 rounded-sm border px-3 text-sm',
              kind === k.value
                ? 'border-accent bg-accent-soft font-medium text-accent'
                : 'border-control bg-surface text-ink-muted hover:text-ink',
            )}
          >
            {k.label}
          </button>
        ))}
      </div>
      <ErrorMessage error={log.error} onRetry={() => void log.refetch()} />
      {log.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-surface">
          <table className="w-full text-sm">
            <caption className="sr-only">Audit entries, newest first</caption>
            <thead className="bg-surface-muted text-left text-ink-subtle">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  When
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  What
                </th>
                <th scope="col" className="hidden px-4 py-2 font-medium md:table-cell">
                  Who
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((entry, i) => (
                <tr
                  key={`${entry.kind}-${entry.at}-${String(i)}`}
                  className="border-t border-border align-top"
                >
                  <td className="px-4 py-2.5 whitespace-nowrap text-ink-muted tabular">
                    {WHEN.format(new Date(entry.at))}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge tone={TONE[entry.kind]}>{LABEL[entry.kind]}</Badge>
                      <span className="font-tech text-xs text-ink">{entry.subject}</span>
                    </span>
                    <span className="mt-0.5 block text-ink">{entry.summary}</span>
                  </td>
                  <td className="hidden px-4 py-2.5 text-ink-muted md:table-cell">
                    {entry.actor ?? 'System'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!items.length ? <p className="p-4 text-sm text-ink-muted">Nothing recorded yet.</p> : null}
        </div>
      )}
      {log.hasNextPage ? (
        <Button
          variant="secondary"
          className="self-start"
          busy={log.isFetchingNextPage}
          onClick={() => void log.fetchNextPage()}
        >
          Show older entries
        </Button>
      ) : null}
    </div>
  )
}
