import { useEffect, useRef } from 'react'
import { Button } from './Button'

/**
 * Loads the next page as the end of a list scrolls into view, with a visible "Show more" button
 * as the keyboard and no-JavaScript-observer fallback (and for people who prefer to choose).
 * Announces how many items are showing.
 */
export function InfiniteListFooter({
  hasMore,
  loading,
  onLoadMore,
  shown,
  total,
  noun = 'items',
}: {
  hasMore: boolean
  loading: boolean
  onLoadMore: () => void
  shown: number
  total?: number | undefined
  noun?: string
}) {
  const sentinel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = sentinel.current
    if (!node || !hasMore || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !loading) onLoadMore()
      },
      { rootMargin: '600px 0px' },
    )
    observer.observe(node)
    return () => {
      observer.disconnect()
    }
  }, [hasMore, loading, onLoadMore])

  return (
    <div className="flex flex-col items-center gap-3 py-6">
      <p className="text-sm text-ink-subtle" aria-live="polite">
        Showing {shown}
        {total === undefined ? '' : ` of ${String(total)}`} {noun}
      </p>
      {hasMore ? (
        <>
          <div ref={sentinel} aria-hidden="true" />
          <Button variant="secondary" busy={loading} onClick={onLoadMore}>
            {loading ? 'Loading more' : 'Show more'}
          </Button>
        </>
      ) : null}
    </div>
  )
}
