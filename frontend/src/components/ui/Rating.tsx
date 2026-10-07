import { cn } from '@/lib/cn'
import { Star } from 'lucide-react'

/** Read-only star rating with the number spelled out for screen readers ("4.5 out of 5"). */
export function Rating({
  value,
  count,
  size = 'sm',
  className,
}: {
  value: number
  count?: number
  size?: 'sm' | 'md'
  className?: string
}) {
  const icon = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4.5 w-4.5'
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span aria-hidden="true" className="flex">
        {[1, 2, 3, 4, 5].map((star) => {
          const fill = Math.min(Math.max(value - (star - 1), 0), 1)
          return (
            <span key={star} className={cn('relative', icon)}>
              <Star
                className={cn('absolute inset-0 text-border-strong', icon)}
                fill="currentColor"
                strokeWidth={0}
              />
              <span className="absolute inset-0 overflow-hidden" style={{ width: `${String(fill * 100)}%` }}>
                <Star className={cn('text-warning', icon)} fill="currentColor" strokeWidth={0} />
              </span>
            </span>
          )
        })}
      </span>
      <span className="sr-only">{value.toFixed(1)} out of 5</span>
      {count === undefined ? null : (
        <span className="text-sm text-ink-subtle tabular">
          ({count}
          <span className="sr-only"> reviews</span>)
        </span>
      )}
    </span>
  )
}

/** Choose a rating 1 to 5: a radio group, so arrow keys work and the choice is announced. */
export function RatingInput({
  value,
  onChange,
  label = 'Rating',
}: {
  value: number
  onChange: (value: number) => void
  label?: string
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-ink">{label}</legend>
      <div className="mt-1.5 flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <label
            key={star}
            className="cursor-pointer rounded-sm p-0.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent"
          >
            <input
              type="radio"
              name={label}
              value={star}
              checked={value === star}
              onChange={() => {
                onChange(star)
              }}
              className="sr-only"
            />
            <Star
              aria-hidden="true"
              className={cn('h-6 w-6', star <= value ? 'text-warning' : 'text-border-strong')}
              fill="currentColor"
              strokeWidth={0}
            />
            <span className="sr-only">
              {star} {star === 1 ? 'star' : 'stars'}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
