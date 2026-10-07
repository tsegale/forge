import { cn } from '@/lib/cn'
import { formatCents, type Price as PriceValue } from '@/lib/money'

const SIZES = {
  sm: 'text-base',
  md: 'text-lg',
  lg: 'text-2xl',
  xl: 'text-3xl',
} as const

/**
 * A price in N$, always VAT-inclusive. `was` shows the previous price struck through (price drops);
 * `note` adds "VAT included" under it, which the product page and cart summary show.
 */
export function Price({
  price,
  was,
  size = 'md',
  note = false,
  className,
}: {
  price: PriceValue
  was?: PriceValue | null | undefined
  size?: keyof typeof SIZES
  note?: boolean
  className?: string
}) {
  const dropped = was && was.amount_cents > price.amount_cents
  return (
    <div className={cn('flex flex-col', className)}>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className={cn('font-semibold tracking-tight text-ink tabular', SIZES[size])}>
          {formatCents(price.amount_cents, price.currency)}
        </span>
        {dropped ? (
          <>
            <span className="sr-only">, down from </span>
            <s className="text-sm text-ink-subtle tabular">{formatCents(was.amount_cents, was.currency)}</s>
          </>
        ) : null}
      </p>
      {note ? <p className="text-xs text-ink-subtle">VAT included</p> : null}
    </div>
  )
}
