import { cn } from '@/lib/cn'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { PhotoSource } from '@/lib/photos'
import { Photo } from './Photo'

/** Nothing to show yet: what this place is for, and the next step to fill it. */
export function EmptyState({
  icon: Icon,
  photo,
  title,
  children,
  action,
  className,
}: {
  icon: LucideIcon
  /** Replaces the icon with a photograph, for the larger empty pages (cart, orders). */
  photo?: PhotoSource
  title: string
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <section className={cn('mx-auto flex max-w-md flex-col items-center px-4 py-14 text-center', className)}>
      {photo ? (
        <Photo
          photo={photo}
          sizes="(min-width: 448px) 416px, 100vw"
          className="w-full rounded-md border border-border"
        />
      ) : (
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted text-ink-subtle">
          <Icon aria-hidden="true" className="h-6 w-6" strokeWidth={1.75} />
        </span>
      )}
      <h2 className="mt-4 text-lg font-semibold text-ink">{title}</h2>
      {children ? <div className="mt-1.5 text-base text-ink-muted">{children}</div> : null}
      {action ? <div className="mt-6 flex flex-wrap justify-center gap-3">{action}</div> : null}
    </section>
  )
}
