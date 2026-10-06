import { useQuery } from '@tanstack/react-query'
import { Check, Layers, ShoppingCart, Truck } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ApiError } from '@/api/errors'
import { configQuery } from '@/app/config'
import { addPart } from '@/builds/draft'
import { setDraft, useDraft } from '@/builds/store'
import { addToCart, useCartMutation } from '@/cart/api'
import { setMiniCartOpen } from '@/cart/miniCart'
import { inSentence, KIND_LABELS } from '@/catalog/labels'
import { componentKindsQuery, productQuery } from '@/catalog/queries'
import { priceHistoryQuery } from '@/catalog/reviews'
import { keySpecs, specGroups } from '@/catalog/specs'
import { PriceHistoryChart } from '@/components/charts/PriceHistoryChart'
import { SpecTable } from '@/components/catalog/SpecTable'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { Price } from '@/components/ui/Price'
import { Rating } from '@/components/ui/Rating'
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton'
import { StockIndicator } from '@/components/ui/StockIndicator'
import { cn } from '@/lib/cn'
import { formatCents } from '@/lib/money'
import { usePageTitle } from '@/lib/usePageTitle'
import { NotFound } from '@/pages/NotFound'
import { BuildVerdict } from './product/BuildVerdict'
import { CompatibleParts } from './product/CompatibleParts'
import { Gallery } from './product/Gallery'
import { PriceAlertControl } from './product/PriceAlertControl'
import { Reviews } from './product/Reviews'

const RANGES = [
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '1 year' },
] as const

function Section({
  id,
  title,
  children,
  action,
}: {
  id: string
  title: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-28 border-t border-border pt-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 id={`${id}-title`} className="text-xl font-semibold tracking-tight text-ink">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function PriceHistorySection({ slug, name }: { slug: string; name: string }) {
  const [days, setDays] = useState<number>(90)
  const history = useQuery(priceHistoryQuery(slug, days))
  const data = history.data
  return (
    <Section
      id="price-history"
      title="Price history"
      action={
        <div role="group" aria-label="Period" className="flex rounded-md border border-control p-0.5">
          {RANGES.map((range) => (
            <button
              key={range.days}
              type="button"
              aria-pressed={days === range.days}
              onClick={() => {
                setDays(range.days)
              }}
              className={cn(
                'h-8 rounded-sm px-3 text-sm',
                days === range.days
                  ? 'bg-accent-soft font-medium text-accent'
                  : 'text-ink-muted hover:text-ink',
              )}
            >
              {range.label}
            </button>
          ))}
        </div>
      }
    >
      {history.isError ? (
        <ErrorMessage error={history.error} onRetry={() => void history.refetch()} />
      ) : !data ? (
        <Skeleton className="aspect-[640/220] w-full" />
      ) : (
        <div className={cn('transition-opacity', history.isPlaceholderData && 'opacity-60')}>
          <p className="mb-4 text-base text-ink-muted">
            {data.change_cents < 0 ? (
              <>
                <span className="font-medium text-success-ink">{formatCents(-data.change_cents)} lower</span>{' '}
                than {days === 365 ? 'a year' : `${String(days)} days`} ago.
              </>
            ) : data.change_cents > 0 ? (
              <>
                {formatCents(data.change_cents)} higher than{' '}
                {days === 365 ? 'a year' : `${String(days)} days`} ago.
              </>
            ) : (
              <>Unchanged over this period.</>
            )}{' '}
            Lowest in this period:{' '}
            <span className="font-medium text-ink tabular">{formatCents(data.lowest_cents)}</span>.
          </p>
          <PriceHistoryChart
            points={data.points}
            currentCents={data.current_cents}
            title={`Price of ${name} over the last ${days === 365 ? 'year' : `${String(days)} days`}`}
          />
        </div>
      )}
    </Section>
  )
}

/**
 * A product's page: photos, the buy box (price, stock, cart, build verdict), then overview,
 * grouped specifications, price history, reviews and parts that work with it.
 */
export function ProductPage() {
  const { slug = '' } = useParams()
  const product = useQuery(productQuery(slug))
  const kinds = useQuery(componentKindsQuery)
  const config = useQuery(configQuery)
  const draft = useDraft()
  const navigate = useNavigate()
  const add = useCartMutation((productId: number) => addToCart(productId))
  usePageTitle(product.data?.name)

  if (product.isError && product.error instanceof ApiError && product.error.status === 404)
    return <NotFound />
  if (product.isError) return <ErrorMessage error={product.error} onRetry={() => void product.refetch()} />
  if (!product.data) {
    return (
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]" aria-busy="true">
        <Skeleton className="aspect-[4/3] w-full" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-3/4" />
          <SkeletonText lines={4} />
          <Skeleton className="h-11 w-full" />
        </div>
      </div>
    )
  }

  const p = product.data
  const kindLabel = KIND_LABELS[p.kind] ?? p.kind
  const kind = kinds.data?.items.find((k) => k.code === p.kind)
  const inBuild = draft.items.some((item) => item.product.id === p.id)
  const replaces = kind?.max_per_build === 1
  const freeOver = config.data?.shipping.free_threshold_cents
  const highlights = keySpecs(p.specs)
  const sections = [
    ...(p.description ? [['overview', 'Overview']] : []),
    ['specifications', 'Specifications'],
    ['price-history', 'Price history'],
    ['reviews', 'Reviews'],
    ...(p.kind !== 'accessory' ? [['works-with', 'Works with']] : []),
  ] as const

  return (
    <div className="flex flex-col gap-8">
      <Breadcrumbs
        items={[
          { label: 'Home', to: '/' },
          { label: 'Shop', to: '/shop' },
          { label: kindLabel, to: `/shop/${p.kind}` },
          { label: p.name },
        ]}
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-12">
        <Gallery photos={p.images} kind={p.kind} name={p.name} />

        <div className="flex flex-col gap-5 lg:sticky lg:top-28 lg:self-start">
          <div>
            <p className="text-sm font-medium text-ink-muted">{p.brand.name}</p>
            <h1 className="mt-1 text-2xl leading-tight font-semibold tracking-tight text-ink sm:text-3xl">
              {p.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-subtle">
              <span className="font-tech">SKU {p.sku}</span>
              {p.rating.count ? (
                <a href="#reviews" className="inline-flex items-center gap-1.5 hover:text-accent">
                  <Rating value={p.rating.average ?? 0} />
                  <span className="tabular">
                    {p.rating.average?.toFixed(1)} ({p.rating.count}{' '}
                    {p.rating.count === 1 ? 'review' : 'reviews'})
                  </span>
                </a>
              ) : (
                <a href="#reviews" className="hover:text-accent">
                  No reviews yet
                </a>
              )}
            </div>
          </div>

          {highlights.length ? (
            <ul aria-label="Key specifications" className="flex flex-col gap-1.5 text-base text-ink">
              {highlights.map((spec) => (
                <li key={spec} className="flex gap-2">
                  <Check aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-accent" />
                  {spec}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="rounded-md border border-border bg-surface p-5">
            <Price price={p.price} size="xl" note />
            <StockIndicator availability={p.availability} detail className="mt-2" />
            <div className="mt-5 flex flex-col gap-2.5">
              <Button
                size="lg"
                className="w-full"
                busy={add.isPending}
                disabled={!p.availability.in_stock}
                onClick={() => {
                  add.mutate(p.id, {
                    onSuccess: () => {
                      setMiniCartOpen(true)
                    },
                  })
                }}
              >
                <ShoppingCart aria-hidden="true" className="h-4.5 w-4.5" />
                {p.availability.in_stock ? 'Add to cart' : 'Out of stock'}
              </Button>
              {kind ? (
                <Button
                  size="lg"
                  variant="secondary"
                  className="w-full"
                  disabled={inBuild && replaces}
                  onClick={() => {
                    setDraft((current) => addPart(current, p, kind.max_per_build))
                    void navigate('/configurator')
                  }}
                >
                  <Layers aria-hidden="true" className="h-4.5 w-4.5" />
                  {inBuild && replaces ? 'In your build' : 'Add to build'}
                </Button>
              ) : null}
              {kind && replaces && !inBuild ? (
                <p className="text-sm text-ink-subtle">
                  Replaces any {inSentence(kind.label)} already in your build.
                </p>
              ) : null}
            </div>
            {add.error ? (
              <div className="mt-3">
                <ErrorMessage error={add.error} />
              </div>
            ) : null}
            <div className="mt-4">
              <PriceAlertControl productId={p.id} productName={p.name} priceCents={p.price.amount_cents} />
            </div>
            <p className="mt-4 flex items-start gap-2 border-t border-border pt-4 text-sm text-ink-muted">
              <Truck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-ink-subtle" />
              <span>
                Ships from Windhoek.
                {freeOver === undefined ? null : <> Free delivery on orders over {formatCents(freeOver)}.</>}
              </span>
            </p>
          </div>

          {kind && p.kind !== 'accessory' ? <BuildVerdict product={p} draft={draft} kind={kind} /> : null}
        </div>
      </div>

      <nav
        aria-label="On this page"
        className="sticky top-16 z-10 -mx-4 border-y border-border bg-canvas/95 px-4 sm:mx-0 sm:rounded-md sm:border sm:px-2"
      >
        <ul className="flex gap-1 overflow-x-auto py-1.5 text-sm">
          {sections.map(([id, label]) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className="block rounded-sm px-3 py-1.5 whitespace-nowrap text-ink-muted hover:bg-surface-muted hover:text-ink"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {p.description ? (
        <Section id="overview" title="Overview">
          <p className="max-w-prose text-md leading-relaxed text-ink-muted">{p.description}</p>
        </Section>
      ) : null}

      <Section id="specifications" title="Specifications">
        <SpecTable groups={specGroups(p.specs)} caption={`${p.name} specifications`} />
      </Section>

      <PriceHistorySection slug={p.slug} name={p.name} />

      <Section id="reviews" title="Reviews">
        <Reviews slug={p.slug} productName={p.name} />
      </Section>

      {p.kind !== 'accessory' ? (
        <Section id="works-with" title="Works with this part">
          <CompatibleParts productId={p.id} kind={p.kind} />
        </Section>
      ) : null}
    </div>
  )
}
