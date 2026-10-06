import { cn } from '@/lib/cn'

export const LOW_STOCK = 3

/**
 * Availability with a dot and words ("In stock", "Only 2 left", "Out of stock"). `detail` adds the
 * reassurance line used on product pages.
 */
export function StockIndicator({
  availability,
  detail = false,
  className,
}: {
  availability: { in_stock: boolean; quantity_available: number }
  detail?: boolean
  className?: string
}) {
  const { in_stock, quantity_available } = availability
  const state = !in_stock ? 'out' : quantity_available <= LOW_STOCK ? 'low' : 'in'
  const label =
    state === 'out'
      ? 'Out of stock'
      : state === 'low'
        ? `Only ${String(quantity_available)} left`
        : 'In stock'
  return (
    <div className={cn('flex flex-col', className)}>
      <p
        className={cn(
          'inline-flex items-center gap-1.5 text-sm font-medium',
          state === 'out' ? 'text-danger-ink' : state === 'low' ? 'text-warning-ink' : 'text-success-ink',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'h-2 w-2 rounded-full',
            state === 'out' ? 'bg-danger' : state === 'low' ? 'bg-warning' : 'bg-success',
          )}
        />
        {label}
      </p>
      {detail ? (
        <p className="text-xs text-ink-subtle">
          {state === 'out'
            ? 'Add it to a build to be ready when it is back.'
            : 'Reserved for you at checkout, not in the cart.'}
        </p>
      ) : null}
    </div>
  )
}
