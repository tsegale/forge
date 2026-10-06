import { cn } from '@/lib/cn'
import type { Tone } from './Badge'

const FILL: Record<Tone, string> = {
  neutral: 'bg-ink-subtle',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
}

/**
 * A horizontal bar for a quantity against a limit (free-shipping progress, power draw against a
 * supply's rating). `valueText` is what a screen reader hears, e.g. "520 W of 750 W".
 */
export function ProgressBar({
  value,
  max,
  label,
  valueText,
  tone = 'accent',
  role = 'progressbar',
  className,
}: {
  value: number
  max: number
  label: string
  valueText: string
  tone?: Tone
  /** "meter" for a measurement within a known range (power draw); "progressbar" for progress. */
  role?: 'progressbar' | 'meter'
  className?: string
}) {
  const share = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0
  return (
    <div
      role={role}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      aria-valuetext={valueText}
      className={cn('h-2 overflow-hidden rounded-full bg-surface-muted', className)}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-300 ease-out', FILL[tone])}
        style={{ width: `${(share * 100).toFixed(1)}%` }}
      />
    </div>
  )
}
