import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { components } from '@/api/schema'
import { keySpecs } from '@/catalog/specs'
import { Highlight } from '@/components/ui/Highlight'
import { Price } from '@/components/ui/Price'
import { StockIndicator } from '@/components/ui/StockIndicator'
import { cn } from '@/lib/cn'
import { ProductImage, type ImageVariantSet } from './ProductImage'

type Product = components['schemas']['ProductSummary'] & {
  image?: ImageVariantSet | null
  was_price?: components['schemas']['Price'] | null
}

/**
 * A product in a listing. Grid cards for browsing, list rows for comparing specs. The whole card
 * is one link target (the name), with `actions` (add to cart, add to build) outside that link.
 * `note` carries extra context such as why a part is filtered out of a build.
 */
export function ProductCard({
  product,
  layout = 'grid',
  actions,
  note,
  dimmed = false,
  priority = false,
  highlight,
}: {
  product: Product
  layout?: 'grid' | 'list'
  actions?: ReactNode
  note?: ReactNode
  /** Set apart (dashed, muted photo), e.g. incompatible with the build but shown on request. Text keeps full contrast. */
  dimmed?: boolean
  priority?: boolean
  /** Search text to emphasise in the name. */
  highlight?: string | undefined
}) {
  const specs = keySpecs(product.specs)
  const href = `/products/${product.slug}`
  const title = (
    <h3 className="text-base leading-snug font-medium text-ink">
      <Link
        to={href}
        className="rounded-sm after:absolute after:inset-0 hover:text-accent focus-visible:outline-none"
      >
        {highlight ? <Highlight text={product.name} query={highlight} /> : product.name}
      </Link>
    </h3>
  )

  if (layout === 'list') {
    return (
      <article
        className={cn(
          'group relative grid grid-cols-[6rem_1fr] gap-4 rounded-md border border-border bg-surface p-3 transition-shadow hover:shadow-md sm:grid-cols-[7.5rem_1fr_auto]',
          'has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-accent',
          dimmed && 'border-dashed bg-surface-muted shadow-none hover:shadow-none',
        )}
      >
        <ProductImage
          image={product.image}
          kind={product.kind}
          name={product.name}
          variant="thumb"
          priority={priority}
          className={cn(dimmed && 'opacity-50 grayscale')}
        />
        <div className="min-w-0">
          <p className="text-xs text-ink-subtle">{product.brand.name}</p>
          {title}
          <p className="mt-1 font-tech text-xs text-ink-muted">{specs.join(' / ')}</p>
          {note ? <div className="mt-2">{note}</div> : null}
        </div>
        <div className="col-span-2 flex items-end justify-between gap-3 sm:col-span-1 sm:flex-col sm:items-end">
          <Price price={product.price} was={product.was_price} />
          <StockIndicator availability={product.availability} />
          {actions ? <div className="relative z-10 flex gap-2">{actions}</div> : null}
        </div>
      </article>
    )
  }

  return (
    <article
      className={cn(
        'group relative flex flex-col rounded-md border border-border bg-surface p-3 transition-shadow hover:shadow-md',
        'has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-accent',
        dimmed && 'border-dashed bg-surface-muted shadow-none hover:shadow-none',
      )}
    >
      <ProductImage
        image={product.image}
        kind={product.kind}
        name={product.name}
        priority={priority}
        className={cn(dimmed && 'opacity-50 grayscale')}
      />
      <div className="mt-3 flex min-h-0 flex-1 flex-col">
        <p className="text-xs text-ink-subtle">{product.brand.name}</p>
        {title}
        <p className="mt-1.5 line-clamp-2 font-tech text-xs text-ink-muted">{specs.join(' / ')}</p>
        {note ? <div className="mt-2">{note}</div> : null}
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <Price price={product.price} was={product.was_price} />
          <StockIndicator availability={product.availability} />
        </div>
        {actions ? <div className="relative z-10 mt-3 flex gap-2">{actions}</div> : null}
      </div>
    </article>
  )
}

/** The card's loading shape, so a grid of skeletons matches the grid that replaces it. */
export function ProductCardSkeleton({ layout = 'grid' }: { layout?: 'grid' | 'list' }) {
  if (layout === 'list') {
    return (
      <div
        aria-hidden="true"
        className="grid grid-cols-[6rem_1fr] gap-4 rounded-md border border-border bg-surface p-3 sm:grid-cols-[7.5rem_1fr_auto]"
      >
        <div className="aspect-[4/3] animate-skeleton rounded-sm bg-border" />
        <div className="flex flex-col gap-2 py-1">
          <span className="h-3 w-16 animate-skeleton rounded-sm bg-border" />
          <span className="h-4 w-3/4 animate-skeleton rounded-sm bg-border" />
          <span className="h-3 w-1/2 animate-skeleton rounded-sm bg-border" />
        </div>
        <div className="hidden w-24 flex-col items-end gap-2 py-1 sm:flex">
          <span className="h-5 w-20 animate-skeleton rounded-sm bg-border" />
          <span className="h-3 w-14 animate-skeleton rounded-sm bg-border" />
        </div>
      </div>
    )
  }
  return (
    <div aria-hidden="true" className="flex flex-col rounded-md border border-border bg-surface p-3">
      <div className="aspect-[4/3] animate-skeleton rounded-sm bg-border" />
      <span className="mt-3 h-3 w-16 animate-skeleton rounded-sm bg-border" />
      <span className="mt-2 h-4 w-11/12 animate-skeleton rounded-sm bg-border" />
      <span className="mt-2 h-3 w-2/3 animate-skeleton rounded-sm bg-border" />
      <div className="mt-4 flex justify-between">
        <span className="h-5 w-20 animate-skeleton rounded-sm bg-border" />
        <span className="h-3 w-14 animate-skeleton rounded-sm bg-border" />
      </div>
    </div>
  )
}
