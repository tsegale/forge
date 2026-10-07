import { ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'
import type { components } from '@/api/schema'
import { ProductImage } from '@/components/catalog/ProductImage'
import { IconButton } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { cn } from '@/lib/cn'

type Photo = components['schemas']['ProductImageResponse']

/**
 * The product's photos: a large view, thumbnails to switch, and a zoom dialog at full size with
 * arrow-key navigation. Without photos, the kind's drawing stands in (same box, no layout shift).
 */
export function Gallery({ photos, kind, name }: { photos: Photo[]; kind: string; name: string }) {
  const [index, setIndex] = useState(0)
  const [zoomed, setZoomed] = useState(false)
  const current = photos[Math.min(index, photos.length - 1)]
  const many = photos.length > 1
  const step = (delta: number) => {
    setIndex((i) => (i + delta + photos.length) % photos.length)
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (!many) return
    if (event.key === 'ArrowRight') step(1)
    else if (event.key === 'ArrowLeft') step(-1)
  }

  if (!current) {
    return (
      <ProductImage
        kind={kind}
        name={name}
        variant="full"
        priority
        className="rounded-md border border-border"
      />
    )
  }

  return (
    <div className="flex flex-col gap-3" onKeyDown={onKeyDown}>
      <button
        type="button"
        onClick={() => {
          setZoomed(true)
        }}
        aria-label={`Zoom: ${current.alt}`}
        className="group relative block cursor-zoom-in rounded-md border border-border bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <ProductImage image={current} kind={kind} name={name} variant="full" priority />
        <span className="absolute right-3 bottom-3 flex items-center gap-1.5 rounded-sm bg-surface/90 px-2 py-1 text-sm text-ink-muted opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <ZoomIn aria-hidden="true" className="h-4 w-4" /> Zoom
        </span>
      </button>

      {many ? (
        <ul aria-label="Photos" className="grid grid-cols-5 gap-2">
          {photos.map((photo, i) => (
            <li key={photo.full}>
              <button
                type="button"
                aria-label={`Show photo ${String(i + 1)} of ${String(photos.length)}`}
                aria-current={i === index ? 'true' : undefined}
                onClick={() => {
                  setIndex(i)
                }}
                className={cn(
                  'block w-full rounded-sm border bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                  i === index ? 'border-accent ring-1 ring-accent' : 'border-border hover:border-ink-subtle',
                )}
              >
                <ProductImage image={photo} kind={kind} name={name} variant="thumb" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <Dialog open={zoomed} onOpenChange={setZoomed} title={name} size="xl">
        <div className="relative" onKeyDown={onKeyDown}>
          <img
            src={current.full}
            alt={current.alt}
            width={current.width}
            height={current.height}
            className="mx-auto h-auto max-h-[70vh] w-auto max-w-full object-contain"
          />
          {many ? (
            <div className="mt-4 flex items-center justify-center gap-4">
              <IconButton
                label="Previous photo"
                variant="secondary"
                onClick={() => {
                  step(-1)
                }}
              >
                <ChevronLeft aria-hidden="true" className="h-5 w-5" />
              </IconButton>
              <p className="text-sm text-ink-muted tabular" aria-live="polite">
                Photo {index + 1} of {photos.length}
              </p>
              <IconButton
                label="Next photo"
                variant="secondary"
                onClick={() => {
                  step(1)
                }}
              >
                <ChevronRight aria-hidden="true" className="h-5 w-5" />
              </IconButton>
            </div>
          ) : null}
        </div>
      </Dialog>
    </div>
  )
}
