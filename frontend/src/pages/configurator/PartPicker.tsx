import { useInfiniteQuery } from '@tanstack/react-query'
import { Search, SearchX } from 'lucide-react'
import { useDeferredValue, useState } from 'react'
import type { ProductSummary } from '@/builds/draft'
import type { ProductKind } from '@/catalog/filters'
import { inSentence } from '@/catalog/labels'
import { productsQuery } from '@/catalog/queries'
import { keySpecs } from '@/catalog/specs'
import { ProductImage } from '@/components/catalog/ProductImage'
import { Button } from '@/components/ui/Button'
import { Drawer } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { Checkbox, Field, Select } from '@/components/ui/Field'
import { Highlight } from '@/components/ui/Highlight'
import { InfiniteListFooter } from '@/components/ui/InfiniteList'
import { Price } from '@/components/ui/Price'
import { Skeleton } from '@/components/ui/Skeleton'
import { StockIndicator } from '@/components/ui/StockIndicator'
import { cn } from '@/lib/cn'
import { FindingItem } from './FindingItem'
import { findingLabel } from './findings'

export interface PickerTarget {
  kind: ProductKind
  label: string
  /** Single-slot kinds replace the current part rather than adding another. */
  replaces: boolean
}

type Sort = 'price' | '-price' | 'name'

/**
 * Choose a part of one kind, in a side drawer (a bottom sheet on a phone). The list is filtered
 * server-side to parts that would not conflict with the rest of the build (`compatible_with`),
 * the same rules validation uses. Parts that do not fit can be shown too, each with the reason,
 * but cannot be chosen.
 */
export function PartPicker({
  target,
  buildProductIds,
  selectedIds,
  onPick,
  onClose,
}: {
  target: PickerTarget | null
  buildProductIds: number[]
  selectedIds: Set<number>
  onPick: (product: ProductSummary) => void
  onClose: () => void
}) {
  return (
    <Drawer
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={target ? `Choose ${inSentence(target.label)}` : ''}
      description={
        buildProductIds.length
          ? 'Only parts that work with the rest of your build are listed.'
          : 'Any part fits an empty build. Start with the processor to narrow the rest.'
      }
      width="lg"
    >
      {target ? (
        <PickerList
          target={target}
          buildProductIds={buildProductIds}
          selectedIds={selectedIds}
          onPick={onPick}
        />
      ) : null}
    </Drawer>
  )
}

function PickerList({
  target,
  buildProductIds,
  selectedIds,
  onPick,
}: {
  target: PickerTarget
  buildProductIds: number[]
  selectedIds: Set<number>
  onPick: (product: ProductSummary) => void
}) {
  const [search, setSearch] = useState('')
  const [inStock, setInStock] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const [sort, setSort] = useState<Sort>('price')
  const q = useDeferredValue(search.trim())
  const products = useInfiniteQuery(
    productsQuery({
      kind: target.kind,
      sort: q ? 'relevance' : sort,
      ...(buildProductIds.length
        ? { compatible_with: buildProductIds, ...(showAll ? { include_incompatible: true } : {}) }
        : {}),
      ...(q ? { q } : {}),
      ...(inStock ? { in_stock: true } : {}),
    }),
  )
  const items = products.data?.pages.flatMap((page) => page.items) ?? []
  const label = inSentence(target.label)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_11rem]">
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute bottom-3 left-3 z-10 h-4 w-4 text-ink-subtle"
          />
          <Field
            label={`Search ${label} parts`}
            hideLabel
            type="search"
            value={search}
            placeholder="Search by name or model"
            className="[&_input]:pl-9"
            onChange={(event) => {
              setSearch(event.target.value)
            }}
          />
        </div>
        <Select
          label="Sort parts"
          hideLabel
          value={q ? 'relevance' : sort}
          disabled={Boolean(q)}
          onChange={(event) => {
            setSort(event.target.value as Sort)
          }}
        >
          {q ? <option value="relevance">Best match</option> : null}
          <option value="price">Price, low to high</option>
          <option value="-price">Price, high to low</option>
          <option value="name">Name</option>
        </Select>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <Checkbox
          label="In stock only"
          checked={inStock}
          onChange={(event) => {
            setInStock(event.target.checked)
          }}
        />
        {buildProductIds.length ? (
          <Checkbox
            label="Show parts that do not fit"
            checked={showAll}
            onChange={(event) => {
              setShowAll(event.target.checked)
            }}
          />
        ) : null}
      </div>

      {products.isError ? (
        <ErrorMessage error={products.error} onRetry={() => void products.refetch()} />
      ) : products.isPending ? (
        <ul aria-hidden="true" className="flex flex-col gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i}>
              <Skeleton className="h-24 w-full" />
            </li>
          ))}
        </ul>
      ) : items.length === 0 ? (
        <EmptyState icon={SearchX} title={`No ${label} parts match`} className="py-8">
          <p>Clear the search, or include parts that are out of stock.</p>
        </EmptyState>
      ) : (
        <>
          <ul
            className={cn('flex flex-col gap-2', products.isPlaceholderData && 'opacity-60')}
            aria-label={`${target.label} options`}
          >
            {items.map((product) => {
              const selected = selectedIds.has(product.id)
              const fits = product.compatibility?.compatible !== false
              const conflicts = product.compatibility?.conflicts ?? []
              const action = target.replaces ? 'Select' : 'Add'
              return (
                <li
                  key={product.id}
                  className={cn(
                    'rounded-md border p-3',
                    fits ? 'border-border bg-surface' : 'border-dashed border-border-strong bg-surface-muted',
                    selected && 'border-accent ring-1 ring-accent',
                  )}
                >
                  <div className="grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-2 sm:grid-cols-[5rem_1fr_auto] sm:items-center">
                    <ProductImage
                      image={product.image}
                      kind={product.kind}
                      name={product.name}
                      variant="thumb"
                      className={cn(!fits && 'opacity-50 grayscale')}
                    />
                    <div className="min-w-0">
                      <p className="text-xs text-ink-subtle">{product.brand.name}</p>
                      <p className="text-base leading-snug font-medium text-ink">
                        <Highlight text={product.name} query={q} />
                      </p>
                      <p className="mt-0.5 truncate font-tech text-xs text-ink-muted">
                        {keySpecs(product.specs).join(' / ')}
                      </p>
                      {fits && product.compatibility_warnings?.length ? (
                        <ul className="mt-1.5 flex flex-wrap gap-1" aria-label="Notes">
                          {product.compatibility_warnings.map((code) => (
                            <li
                              key={code}
                              className="rounded-sm bg-warning-soft px-1.5 py-0.5 text-xs text-warning-ink"
                            >
                              {findingLabel(code)}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                    <div className="col-span-2 flex items-center justify-between gap-3 sm:col-span-1 sm:flex-col sm:items-end">
                      <div className="sm:text-right">
                        <Price price={product.price} size="sm" />
                        <StockIndicator availability={product.availability} />
                      </div>
                      <Button
                        size="sm"
                        variant={selected && target.replaces ? 'secondary' : 'primary'}
                        disabled={!fits || !product.availability.in_stock || (selected && target.replaces)}
                        onClick={() => {
                          onPick(product)
                        }}
                        aria-label={`${action} ${product.name}`}
                        className="w-24"
                      >
                        {selected && target.replaces ? 'Selected' : fits ? action : 'Does not fit'}
                      </Button>
                    </div>
                  </div>
                  {conflicts.length ? (
                    <ul className="mt-3 flex flex-col gap-2">
                      {conflicts.map((finding) => (
                        <li key={`${finding.code}-${finding.product_ids.join('-')}`}>
                          <FindingItem finding={finding} />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              )
            })}
          </ul>
          <InfiniteListFooter
            hasMore={products.hasNextPage}
            loading={products.isFetchingNextPage}
            onLoadMore={() => void products.fetchNextPage()}
            shown={items.length}
            noun="parts"
          />
        </>
      )}
    </div>
  )
}
