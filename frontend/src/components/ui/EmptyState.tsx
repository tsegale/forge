import { cn } from '@/lib/cn'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/** Nothing to show yet: what this place is for, and the next step to fill it. */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <section className={cn('mx-auto flex max-w-md flex-col items-center px-4 py-14 text-center', className)}>
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted text-ink-subtle">
        <Icon aria-hidden="true" className="h-6 w-6" strokeWidth={1.75} />
      </span>
      <h2 className="mt-4 text-lg font-semibold text-ink">{title}</h2>
      {children ? <div className="mt-1.5 text-base text-ink-muted">{children}</div> : null}
      {action ? <div className="mt-6 flex flex-wrap justify-center gap-3">{action}</div> : null}
    </section>
  )
}
