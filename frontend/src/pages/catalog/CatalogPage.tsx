import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { CircleAlert, LayoutGrid, List, SearchX, SlidersHorizontal, TriangleAlert, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import type { components } from '@/api/schema'
import { addPart } from '@/builds/draft'
import { setDraft, useDraft } from '@/builds/store'
import { addToCart, useCartMutation } from '@/cart/api'
import { setMiniCartOpen } from '@/cart/miniCart'
import {
  COMPAT_PARAM,
  filterValueLabel,
  INCOMPATIBLE_PARAM,
  isProductKind,
  queryFromSearch,
  SORTS,
  SPEC_FILTERS,
} from '@/catalog/filters'
import { inSentence, KIND_LABELS } from '@/catalog/labels'
import { componentKindsQuery, facetsQuery, productsQuery } from '@/catalog/queries'
import { searchHref, suggestQuery } from '@/catalog/search'
import { ProductCard, ProductCardSkeleton } from '@/components/catalog/ProductCard'
import { Breadcrumbs, type Crumb } from '@/components/ui/Breadcrumbs'
import { Button } from '@/components/ui/Button'
import { Drawer } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { Select } from '@/components/ui/Field'
import { InfiniteListFooter } from '@/components/ui/InfiniteList'
import { toast } from '@/components/ui/toastStore'
import { cn } from '@/lib/cn'
import { formatCents } from '@/lib/money'
import { usePageTitle } from '@/lib/usePageTitle'
import { NotFound } from '@/pages/NotFound'
import { FilterPanel } from './FilterPanel'

type Product = components['schemas']['ProductSummary']
type Layout = 'grid' | 'list'

const LAYOUT_KEY = 'forge.catalog.layout'
/** Keys that are page state rather than filters: kept when filters are cleared. */
const NOT_FILTERS = new Set(['q', 'sort', 'kind'])

function readLayout(): Layout {
  try {
    return globalThis.localStorage.getItem(LAYOUT_KEY) === 'list' ? 'list' : 'grid'
  } catch {
    return 'grid' // storage blocked: the default is fine
  }
}

function saveLayout(layout: Layout): void {
  try {
    globalThis.localStorage.setItem(LAYOUT_KEY, layout)
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
}

interface Chip {
  label: string
  remove: Record<string, string | null>
}

function activeChips(
  params: URLSearchParams,
  kind: string | undefined,
  brandNames: Map<string, string>,
): Chip[] {
  const chips: Chip[] = []
  if (params.get(COMPAT_PARAM) === '1') {
    chips.push({ label: 'Fits my build', remove: { [COMPAT_PARAM]: null, [INCOMPATIBLE_PARAM]: null } })
  }
  if (params.get('in_stock') === 'true') chips.push({ label: 'In stock', remove: { in_stock: null } })
  const brands = params.get('brand')?.split(',').filter(Boolean) ?? []
  for (const slug of brands) {
    const rest = brands.filter((b) => b !== slug)
    chips.push({
      label: brandNames.get(slug) ?? slug,
      remove: { brand: rest.length ? rest.join(',') : null },
    })
  }
  const min = Number(params.get('min_price'))
  const max = Number(params.get('max_price'))
  const hasMin = Boolean(params.get('min_price')) && Number.isSafeInteger(min)
  const hasMax = Boolean(params.get('max_price')) && Number.isSafeInteger(max)
  if (hasMin || hasMax) {
    const label =
      hasMin && hasMax
        ? `${formatCents(min)} to ${formatCents(max)}`
        : hasMin
          ? `From ${formatCents(min)}`
          : `Up to ${formatCents(max)}`
    chips.push({ label, remove: { min_price: null, max_price: null } })
  }
  for (const def of kind ? (SPEC_FILTERS[kind] ?? []) : []) {
    const value = params.get(def.key)
    if (value)
      chips.push({ label: `${def.label}: ${filterValueLabel(def, value)}`, remove: { [def.key]: null } })
  }
  return chips
}

/** Why a part does or does not fit the build, in the engine's own words. */
function CompatibilityNote({ product }: { product: Product }) {
  const verdict = product.compatibility
  if (!verdict) return null
  const findings = verdict.compatible ? verdict.warnings : verdict.conflicts
  if (!findings.length) return null
  const Icon = verdict.compatible ? TriangleAlert : CircleAlert
  return (
    <div className={cn('text-sm', verdict.compatible ? 'text-warning-ink' : 'text-danger-ink')}>
      <p className="font-medium">{verdict.compatible ? 'Fits, with a note' : 'Does not fit your build'}</p>
      <ul className="mt-0.5 flex flex-col gap-1">
        {findings.map((finding) => (
          <li key={finding.code} className="flex gap-1.5">
            <Icon aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{finding.message}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function CardActions({ product, buildMax }: { product: Product; buildMax: number | undefined }) {
  const add = useCartMutation((productId: number) => addToCart(productId))
  const navigate = useNavigate()
  return (
    <>
      <Button
        size="sm"
        className="flex-1"
        aria-label={`Add to cart: ${product.name}`}
        busy={add.isPending}
        disabled={!product.availability.in_stock}
        onClick={() => {
          add.mutate(product.id, {
            onSuccess: () => {
              setMiniCartOpen(true)
            },
            onError: (error) => {
              toast({ tone: 'danger', title: 'Could not add to cart', description: error.message })
            },
          })
        }}
      >
        Add to cart
      </Button>
      {buildMax !== undefined && product.compatibility?.compatible !== false ? (
        <Button
          size="sm"
          variant="secondary"
          aria-label={`Add to build: ${product.name}`}
          onClick={() => {
            setDraft((draft) => addPart(draft, product, buildMax))
            toast({
              title: 'Added to your build',
              description: product.name,
              action: {
                label: 'Open build',
                onClick: () => {
                  void navigate('/configurator')
                },
              },
            })
          }}
        >
          Add to build
        </Button>
      ) : null}
    </>
  )
}

function LayoutToggle({ layout, onChange }: { layout: Layout; onChange: (layout: Layout) => void }) {
  const options = [
    { value: 'grid', label: 'Grid view', Icon: LayoutGrid },
    { value: 'list', label: 'List view', Icon: List },
  ] as const
  return (
    <div role="group" aria-label="Layout" className="flex rounded-md border border-control p-0.5">
      {options.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          aria-label={label}
          aria-pressed={layout === value}
          title={label}
          onClick={() => {
            onChange(value)
          }}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-sm',
            layout === value ? 'bg-accent-soft text-accent' : 'text-ink-subtle hover:text-ink',
          )}
        >
          <Icon aria-hidden="true" className="h-4 w-4" />
        </button>
      ))}
    </div>
  )
}

/**
 * Category listing (/shop, /shop/:kind) and search results (/search?q=). Filters, sort and the
 * build-compatibility switch live in the URL; the grid or list choice is a per-browser preference.
 */
export function CatalogPage() {
  const { kind: pathKind } = useParams()
  const { pathname } = useLocation()
  const [params, setParams] = useSearchParams()
  const isSearch = pathname.startsWith('/search')
  const draft = useDraft()
  const kinds = useQuery(componentKindsQuery)
  const [layout, setLayout] = useState<Layout>(readLayout)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const query = useMemo(() => queryFromSearch(params, pathKind), [params, pathKind])
  const kind = query.kind ?? undefined
  const q = query.q ?? ''
  const buildIds = useMemo(
    () => draft.items.flatMap((item) => Array<number>(item.quantity).fill(item.product.id)),
    [draft.items],
  )
  const fitsBuild =
    kind !== undefined && kind !== 'accessory' && buildIds.length > 0 && params.get(COMPAT_PARAM) === '1'
  const listQuery = useMemo(
    () =>
      fitsBuild
        ? {
            ...query,
            compatible_with: buildIds,
            include_incompatible: params.get(INCOMPATIBLE_PARAM) === '1',
          }
        : query,
    [fitsBuild, query, buildIds, params],
  )

  const products = useInfiniteQuery(productsQuery(listQuery))
  const facets = useQuery(facetsQuery(listQuery))
  const total = facets.data?.total
  const nothing = total === 0 && !facets.isPlaceholderData
  const correction = useQuery({ ...suggestQuery(q), enabled: nothing && q.length >= 2 })
  const didYouMean = nothing ? correction.data?.did_you_mean : null

  const kindLabel = kind ? (KIND_LABELS[kind] ?? kind) : undefined
  const title = isSearch ? (q ? `Results for “${q}”` : 'Search') : (kindLabel ?? 'All components')
  usePageTitle(isSearch ? (q ? `Search: ${q}` : 'Search') : (kindLabel ?? 'Shop'))

  if (pathKind !== undefined && !isProductKind(pathKind)) return <NotFound />

  const update = (changes: Record<string, string | null>) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === '') next.delete(key)
        else next.set(key, value)
      }
      return next
    })
  }

  /** A kind's listing with the search and kind-independent filters carried over. */
  const kindHref = (target: string | null) => {
    const next = new URLSearchParams(params)
    for (const def of Object.values(SPEC_FILTERS).flat()) next.delete(def.key)
    next.delete('kind')
    if (target === null || target === 'accessory') {
      next.delete(COMPAT_PARAM)
      next.delete(INCOMPATIBLE_PARAM)
    }
    if (isSearch) {
      if (target) next.set('kind', target)
      return `/search?${next.toString()}`
    }
    const rest = next.toString()
    return `${target ? `/shop/${target}` : '/shop'}${rest ? `?${rest}` : ''}`
  }

  const brandNames = new Map((facets.data?.brands ?? []).map((b) => [b.slug, b.name]))
  const chips = activeChips(params, kind, brandNames)
  const clearAll = () => {
    setParams((prev) => {
      const next = new URLSearchParams()
      for (const [key, value] of prev) if (NOT_FILTERS.has(key)) next.set(key, value)
      return next
    })
  }

  const crumbs: Crumb[] = [{ label: 'Home', to: '/' }]
  if (isSearch) crumbs.push({ label: 'Search' })
  else {
    crumbs.push({ label: 'Shop', to: '/shop' })
    if (kindLabel) crumbs.push({ label: kindLabel })
  }

  const items = products.data?.pages.flatMap((page) => page.items) ?? []
  const buildMax = kind ? kinds.data?.items.find((k) => k.code === kind)?.max_per_build : undefined
  const noun = kindLabel ? inSentence(kindLabel) : 'products'
  const sortValue = params.get('sort') ?? ''
  const panel = (
    <FilterPanel
      kind={kind}
      params={params}
      facets={facets.data}
      onChange={update}
      kindHref={kindHref}
      buildParts={buildIds.length}
    />
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumbs items={crumbs} />
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h1>
        <p className="mt-1 min-h-6 text-base text-ink-muted" aria-live="polite">
          {total === undefined ? null : fitsBuild ? (
            <>
              {total} {total === 1 ? 'part fits' : 'parts fit'} your build
              {facets.data?.incompatible && params.get(INCOMPATIBLE_PARAM) !== '1' ? (
                <>
                  {', '}
                  <button
                    type="button"
                    className="font-medium text-accent hover:underline"
                    onClick={() => {
                      update({ [INCOMPATIBLE_PARAM]: '1' })
                    }}
                  >
                    show {facets.data.incompatible} that do not
                  </button>
                </>
              ) : null}
            </>
          ) : (
            `${String(total)} ${total === 1 ? 'product' : 'products'}`
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[15rem_1fr]">
        <aside aria-label="Filters" className="hidden lg:block">
          {panel}
        </aside>

        <section
          aria-labelledby="results-heading"
          aria-busy={products.isFetching && !products.isFetchingNextPage}
        >
          <h2 id="results-heading" className="sr-only">
            Results
          </h2>
          <div className="flex flex-wrap items-center gap-3 border-b border-border pb-3">
            <Button
              variant="secondary"
              size="sm"
              className="lg:hidden"
              onClick={() => {
                setFiltersOpen(true)
              }}
            >
              <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
              Filters{chips.length ? ` (${String(chips.length)})` : ''}
            </Button>
            <div className="ml-auto flex items-center gap-3">
              <span aria-hidden="true" className="hidden text-sm text-ink-muted sm:inline">
                Sort by
              </span>
              <Select
                label="Sort by"
                hideLabel
                className="w-48"
                value={sortValue}
                onChange={(event) => {
                  update({ sort: event.target.value || null })
                }}
              >
                <option value="">{q ? 'Relevance' : 'Name'}</option>
                {SORTS.filter((s) => q || s.value !== 'name').map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
              <LayoutToggle
                layout={layout}
                onChange={(next) => {
                  setLayout(next)
                  saveLayout(next)
                }}
              />
            </div>
          </div>

          {chips.length ? (
            <ul aria-label="Active filters" className="mt-3 flex flex-wrap items-center gap-2">
              {chips.map((chip) => (
                <li key={chip.label}>
                  <button
                    type="button"
                    aria-label={`Remove filter: ${chip.label}`}
                    onClick={() => {
                      update(chip.remove)
                    }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-control bg-surface pr-2 pl-3 text-sm text-ink hover:border-ink-subtle hover:bg-surface-muted"
                  >
                    {chip.label}
                    <X aria-hidden="true" className="h-3.5 w-3.5 text-ink-subtle" />
                  </button>
                </li>
              ))}
              <li>
                <Button variant="link" size="sm" onClick={clearAll}>
                  Clear all
                </Button>
              </li>
            </ul>
          ) : null}

          <div className="mt-4">
            {products.isError ? (
              <ErrorMessage error={products.error} onRetry={() => void products.refetch()} />
            ) : products.isPending ? (
              <ul
                aria-hidden="true"
                className={cn(
                  layout === 'grid'
                    ? 'grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3'
                    : 'flex flex-col gap-3',
                )}
              >
                {Array.from({ length: 6 }, (_, i) => (
                  <li key={i}>
                    <ProductCardSkeleton layout={layout} />
                  </li>
                ))}
              </ul>
            ) : !items.length ? (
              <EmptyState
                icon={SearchX}
                title={q ? `No ${noun} match “${q}”` : `No ${noun} match these filters`}
                action={
                  <>
                    {didYouMean ? (
                      <Button asChild>
                        <Link to={searchHref(didYouMean)}>Search for &ldquo;{didYouMean}&rdquo;</Link>
                      </Button>
                    ) : null}
                    {chips.length ? (
                      <Button variant="secondary" onClick={clearAll}>
                        Clear all filters
                      </Button>
                    ) : null}
                  </>
                }
              >
                {didYouMean ? (
                  <p>
                    Did you mean <strong className="font-semibold text-ink">{didYouMean}</strong>?
                  </p>
                ) : (
                  <p>Try a model number such as 7800X3D, a brand, or fewer filters.</p>
                )}
              </EmptyState>
            ) : (
              <>
                <ul
                  className={cn(
                    'transition-opacity',
                    layout === 'grid'
                      ? 'grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3'
                      : 'flex flex-col gap-3',
                    products.isPlaceholderData && 'opacity-60',
                  )}
                >
                  {items.map((product, index) => (
                    <li key={product.id} className="grid">
                      <ProductCard
                        product={product}
                        layout={layout}
                        priority={index < 3}
                        highlight={q || undefined}
                        dimmed={product.compatibility?.compatible === false}
                        note={<CompatibilityNote product={product} />}
                        actions={<CardActions product={product} buildMax={buildMax} />}
                      />
                    </li>
                  ))}
                </ul>
                <InfiniteListFooter
                  hasMore={products.hasNextPage}
                  loading={products.isFetchingNextPage}
                  onLoadMore={() => void products.fetchNextPage()}
                  shown={items.length}
                  total={fitsBuild && params.get(INCOMPATIBLE_PARAM) === '1' ? undefined : total}
                  noun={noun}
                />
              </>
            )}
          </div>
        </section>
      </div>

      <Drawer
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        title="Filters"
        width="sm"
        footer={
          <div className="flex gap-3">
            {chips.length ? (
              <Button variant="secondary" onClick={clearAll}>
                Clear all
              </Button>
            ) : null}
            <Button
              className="flex-1"
              onClick={() => {
                setFiltersOpen(false)
              }}
            >
              {total === undefined
                ? 'Show results'
                : `Show ${String(total)} ${total === 1 ? 'result' : 'results'}`}
            </Button>
          </div>
        }
      >
        {panel}
      </Drawer>
    </div>
  )
}
