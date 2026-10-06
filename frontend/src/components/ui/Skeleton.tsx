import { cn } from '@/lib/cn'
import type { ReactNode } from 'react'

/**
 * Placeholder blocks shaped like the content that is loading, so nothing shifts when it arrives.
 * Each block is decorative; wrap a loading region in <LoadingRegion> to announce it once.
 */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('block animate-skeleton rounded-sm bg-border', className)} />
}

/** Lines of text-shaped skeletons; the last line is shorter, like a real paragraph. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <span aria-hidden="true" className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn('h-3.5', i === lines - 1 && lines > 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </span>
  )
}

/** A region that is loading: announced as busy to assistive technology, with a hidden label. */
export function LoadingRegion({
  label = 'Loading',
  children,
  className,
}: {
  label?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  )
}
