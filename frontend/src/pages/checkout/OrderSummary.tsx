import { ChevronDown } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import type { components } from '@/api/schema'
import { ProductImage } from '@/components/catalog/ProductImage'
import { cn } from '@/lib/cn'
import { formatPrice } from '@/lib/money'

type Price = components['schemas']['Price']
type Photo = components['schemas']['ProductImageResponse']

export interface SummaryLine {
  key: number
  name: string
  kind: string
  image: Photo | null
  quantity: number
  lineTotal: Price
  /** Shown under the line, e.g. "Only 2 available". */
  note?: ReactNode
}

/**
 * The order at a glance, beside every checkout step. On a phone it folds behind a "Show order
 * summary" bar with the total, so the step itself comes first (the Stripe Checkout pattern).
 */
export function OrderSummary({
  lines,
  total,
  totals,
  children,
}: {
  lines: SummaryLine[]
  total: Price | null
  totals: ReactNode
  children?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const count = lines.reduce((sum, line) => sum + line.quantity, 0)
  return (
    <aside
      aria-label="Order summary"
      className="h-fit rounded-md border border-border bg-surface lg:sticky lg:top-8"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setOpen((value) => !value)
        }}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left lg:hidden"
      >
        <span className="flex items-center gap-1.5 text-base font-medium text-accent">
          {open ? 'Hide' : 'Show'} order summary
          <ChevronDown
            aria-hidden="true"
            className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
          />
        </span>
        {total ? <span className="text-lg font-semibold text-ink tabular">{formatPrice(total)}</span> : null}
      </button>
      <div
        id={id}
        className={cn('border-t border-border p-5 lg:block lg:border-0', open ? 'block' : 'hidden')}
      >
        <h2 className="hidden text-base font-semibold text-ink lg:block">
          Order summary{' '}
          <span className="font-normal text-ink-subtle">
            ({count} {count === 1 ? 'item' : 'items'})
          </span>
        </h2>
        <ul className="flex flex-col gap-3 lg:mt-4">
          {lines.map((line) => (
            <li key={line.key} className="grid grid-cols-[3.5rem_1fr_auto] items-start gap-3">
              <div className="relative">
                <ProductImage
                  image={line.image}
                  kind={line.kind}
                  name={line.name}
                  variant="thumb"
                  className="rounded-sm border border-border"
                />
                {line.quantity > 1 ? (
                  <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-ink-muted px-1 text-xs font-medium text-white tabular">
                    <span className="sr-only">Quantity </span>
                    {line.quantity}
                  </span>
                ) : null}
              </div>
              <div className="min-w-0 text-sm">
                <p className="leading-snug text-ink">{line.name}</p>
                {line.note}
              </div>
              <p className="text-sm font-medium text-ink tabular">{formatPrice(line.lineTotal)}</p>
            </li>
          ))}
        </ul>
        <div className="mt-4 border-t border-border pt-4">{totals}</div>
        {children ? <div className="mt-4 border-t border-border pt-4">{children}</div> : null}
      </div>
    </aside>
  )
}
