import { cn } from '@/lib/cn'
import type { ReactNode } from 'react'

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

const BADGE: Record<Tone, string> = {
  neutral: 'border-border bg-surface-muted text-ink-muted',
  accent: 'border-accent/20 bg-accent-soft text-accent',
  success: 'border-success/25 bg-success-soft text-success-ink',
  warning: 'border-warning/30 bg-warning-soft text-warning-ink',
  danger: 'border-danger/25 bg-danger-soft text-danger-ink',
}

const DOT: Record<Tone, string> = {
  neutral: 'bg-ink-subtle',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
}

/** A short label: a category, a count, a warning code. */
export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 rounded-sm border px-1.5 text-xs font-medium whitespace-nowrap',
        BADGE[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/** A state (order status, build status): a coloured dot plus the word, so colour is never the only cue. */
export function StatusPill({
  tone,
  children,
  className,
}: {
  tone: Tone
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap',
        BADGE[tone],
        className,
      )}
    >
      <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', DOT[tone])} />
      {children}
    </span>
  )
}
