import { useInfiniteQuery } from '@tanstack/react-query'
import { useDeferredValue, useState } from 'react'
import type { ProductSummary } from '@/builds/draft'
import type { ProductKind } from '@/catalog/filters'
import { inSentence } from '@/catalog/labels'
import { productsQuery } from '@/catalog/queries'
import { specRows } from '@/catalog/specs'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { formatPrice } from '@/lib/money'
import { StockBadge } from '@/pages/catalog/ProductCard'
import { findingLabel } from './findings'

export interface PickerTarget {
  kind: ProductKind
  label: string
  /** Single-slot kinds replace the current part rather than adding another. */
  replaces: boolean
}

/**
 * Choose a part of one kind. The list is filtered server-side to parts that would not conflict
 * with the rest of the build (`compatible_with`), the same rules the validation uses, so a
 * customer cannot pick their way into an incompatible build.
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
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={target ? `Choose ${inSentence(target.label)}` : ''}
      description={
        buildProductIds.length
          ? 'Showing only parts compatible with the rest of your build.'
          : 'Any part fits an empty build. Start with the processor to narrow the rest.'
      }
      wide
    >
      {target ? (
        <PickerList
          target={target}
          buildProductIds={buildProductIds}
          selectedIds={selectedIds}
          onPick={onPick}
        />
      ) : null}
    </Dialog>
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
  const q = useDeferredValue(search.trim())
  const products = useInfiniteQuery(
    productsQuery({
      kind: target.kind,
      ...(buildProductIds.length ? { compatible_with: buildProductIds } : {}),
      ...(q ? { q } : {}),
      ...(inStock ? { in_stock: true } : {}),
    }),
  )
  const items = products.data?.pages.flatMap((page) => page.items) ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex-1">
          <span className="sr-only">Search {inSentence(target.label)} parts</span>
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
            }}
            placeholder="Search by name or model"
            className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            checked={inStock}
            onChange={(event) => {
              setInStock(event.target.checked)
            }}
          />
          In stock only
        </label>
      </div>

      {products.isError ? <ErrorMessage error={products.error} /> : null}
      {products.isPending ? <p className="text-sm text-ink-muted">Loading parts</p> : null}
      {products.isSuccess && items.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No compatible {inSentence(target.label)} parts match. Try clearing the search or including parts
          that are out of stock.
        </p>
      ) : null}

      <ul className="divide-y divide-border" aria-label={`${target.label} options`}>
        {items.map((product) => {
          const selected = selectedIds.has(product.id)
          return (
            <li key={product.id} className="flex items-center gap-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-ink-subtle">{product.brand.name}</p>
                <p className="text-sm font-medium">{product.name}</p>
                <p className="mt-0.5 truncate text-xs text-ink-muted">
                  {specRows(product.specs)
                    .slice(0, 4)
                    .map((row) => row.value)
                    .join(' / ')}
                </p>
                {product.compatibility_warnings?.length ? (
                  <ul className="mt-1 flex flex-wrap gap-1">
                    {product.compatibility_warnings.map((code) => (
                      <li key={code} className="rounded bg-warning-soft px-1.5 py-0.5 text-xs text-warning">
                        {findingLabel(code)}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold tabular">{formatPrice(product.price)}</p>
                <StockBadge availability={product.availability} />
              </div>
              <Button
                variant={selected && target.replaces ? 'secondary' : 'primary'}
                disabled={!product.availability.in_stock || (selected && target.replaces)}
                onClick={() => {
                  onPick(product)
                }}
                aria-label={`${target.replaces ? 'Select' : 'Add'} ${product.name}`}
                className="w-24"
              >
                {selected && target.replaces ? 'Selected' : target.replaces ? 'Select' : 'Add'}
              </Button>
            </li>
          )
        })}
      </ul>

      {products.hasNextPage ? (
        <Button
          variant="secondary"
          busy={products.isFetchingNextPage}
          onClick={() => void products.fetchNextPage()}
          className="w-full"
        >
          Show more
        </Button>
      ) : null}
    </div>
  )
}
