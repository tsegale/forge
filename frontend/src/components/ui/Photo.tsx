import { cn } from '@/lib/cn'
import type { PhotoSource } from '@/lib/photos'

/**
 * A responsive photograph in a box of fixed aspect ratio, so nothing shifts while it loads.
 * Lazy by default; `priority` loads it eagerly at high priority (the largest image above the fold).
 */
export function Photo({
  photo,
  sizes,
  priority = false,
  fill = false,
  alt,
  className,
  imgClassName,
}: {
  photo: PhotoSource
  /** The rendered width at each breakpoint, so the browser picks the right variant. */
  sizes: string
  priority?: boolean
  /** Fill the positioned parent instead of keeping the photo's own ratio (the parent fixes the box). */
  fill?: boolean
  /** Overrides the photo's own description, for example "" where it repeats nearby text. */
  alt?: string
  className?: string
  imgClassName?: string
}) {
  return (
    <div
      className={cn('overflow-hidden bg-surface-muted', fill ? 'absolute inset-0' : 'relative', className)}
      style={fill ? undefined : { aspectRatio: photo.aspect }}
    >
      <img
        src={photo.src}
        srcSet={photo.srcSet}
        sizes={sizes}
        width={photo.width}
        height={photo.height}
        alt={alt ?? photo.alt}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
        className={cn('absolute inset-0 h-full w-full object-cover', imgClassName)}
      />
    </div>
  )
}
