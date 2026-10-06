import { cn } from '@/lib/cn'
import { useState } from 'react'
import { KindIllustration } from './KindIllustration'

export interface ImageVariantSet {
  thumb?: string | null
  card?: string | null
  full?: string | null
  alt?: string | null
}

/**
 * A product picture in a fixed-ratio box (4:3), so the layout never shifts while it loads or
 * when a product has no photo. Falls back to the kind's drawing on a missing or broken image.
 */
export function ProductImage({
  image,
  kind,
  name,
  variant = 'card',
  className,
  priority = false,
}: {
  image?: ImageVariantSet | null | undefined
  kind: string
  name: string
  variant?: 'thumb' | 'card' | 'full'
  className?: string
  /** Load eagerly (above-the-fold images); everything else is lazy. */
  priority?: boolean
}) {
  const [broken, setBroken] = useState(false)
  const src = image?.[variant] ?? image?.card ?? image?.full ?? null
  return (
    <div className={cn('relative aspect-[4/3] overflow-hidden rounded-sm bg-surface-muted', className)}>
      {src && !broken ? (
        <img
          src={src}
          alt={image?.alt ?? name}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          onError={() => {
            setBroken(true)
          }}
          className="absolute inset-0 h-full w-full object-contain p-[6%] mix-blend-multiply"
        />
      ) : (
        <div className="absolute inset-0 p-[12%]">
          <KindIllustration kind={kind} label={`${name} (no photo yet)`} />
        </div>
      )}
    </div>
  )
}
