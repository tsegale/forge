import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useDeferredValue, useState } from 'react'
import { adminProductsQuery, type AdminProductRow } from '@/admin/api'
import { componentKindsQuery } from '@/catalog/queries'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { formatCents } from '@/lib/money'
import { ProductDialog } from './ProductDialog'
import { StockDialog } from './StockDialog'

const LOW_STOCK = 3

type Editing = { kind: 'stock' | 'product'; product: AdminProductRow } | null

/** Every product, sold or not, with stock levels; stock, price and availability are editable. */
export function InventoryPage() {
  const [kind, setKind] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [active, setActive] = useState<boolean | null>(null)
  const q = useDeferredValue(search.trim())
  const kinds = useQuery(componentKindsQuery)
  const products = useInfiniteQuery(adminProductsQuery({ kind, q, active }))
  const rows = products.data?.pages.flatMap((page) => page.items) ?? []
  const [editing, setEditing] = useState<Editing>(null)
  const kindLabel = (code: string) => kinds.data?.items.find((k) => k.code === code)?.label ?? code

  return (
    <section aria-labelledby="inventory-heading" className="space-y-4">
      <h1 id="inventory-heading" className="text-2xl font-semibold">
        Inventory
      </h1>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex-1">
          <span className="sr-only">Search by name or SKU</span>
          <input
            type="search"
            value={search}
            placeholder="Search by name or SKU"
            onChange={(event) => {
              setSearch(event.target.value)
            }}
            className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-ink-muted">Kind</span>
          <select
            value={kind ?? ''}
            onChange={(event) => {
              setKind(event.target.value || null)
            }}
            className="rounded-md border border-border-strong bg-surface px-3 py-2"
          >
            <option value="">All kinds</option>
            {kinds.data?.items.map((k) => (
              <option key={k.code} value={k.code}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-ink-muted">Availability</span>
          <select
            value={active === null ? '' : String(active)}
            onChange={(event) => {
              setActive(event.target.value === '' ? null : event.target.value === 'true')
            }}
            className="rounded-md border border-border-strong bg-surface px-3 py-2"
          >
            <option value="">All products</option>
            <option value="true">On sale</option>
            <option value="false">Withdrawn</option>
          </select>
        </label>
      </div>

      <ErrorMessage error={products.error} />
      {products.isPending ? <p className="text-sm text-ink-muted">Loading</p> : null}
      {products.isSuccess && rows.length === 0 ? (
        <p className="py-8 text-center text-ink-muted">No products match.</p>
      ) : null}
      {rows.length ? (
        <div className="overflow-x-auto rounded-md border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-canvas text-left text-ink-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  Product
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Kind
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Price
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  On hand
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Reserved
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Available
                </th>
                <th scope="col" className="px-4 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((product) => (
                <tr key={product.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <p className="font-medium">{product.name}</p>
                    <p className="font-mono text-xs text-ink-subtle">
                      {product.sku}
                      {product.is_active ? null : <span className="font-sans"> (withdrawn)</span>}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{kindLabel(product.kind_code)}</td>
                  <td className="px-4 py-3 text-right tabular">{formatCents(product.price_cents)}</td>
                  <td className="px-4 py-3 text-right tabular">{product.quantity_on_hand}</td>
                  <td className="px-4 py-3 text-right tabular">{product.quantity_reserved}</td>
                  <td
                    className={`px-4 py-3 text-right font-medium tabular ${
                      product.quantity_available <= LOW_STOCK ? 'text-warning-ink' : ''
                    }`}
                  >
                    {product.quantity_available}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="secondary"
                        aria-label={`Edit stock for ${product.name}`}
                        onClick={() => {
                          setEditing({ kind: 'stock', product })
                        }}
                      >
                        Stock
                      </Button>
                      <Button
                        variant="ghost"
                        aria-label={`Edit price and availability for ${product.name}`}
                        onClick={() => {
                          setEditing({ kind: 'product', product })
                        }}
                      >
                        Edit
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {products.hasNextPage ? (
        <Button
          variant="secondary"
          busy={products.isFetchingNextPage}
          onClick={() => void products.fetchNextPage()}
        >
          Show more
        </Button>
      ) : null}

      {editing?.kind === 'stock' ? (
        <StockDialog
          product={editing.product}
          onClose={() => {
            setEditing(null)
          }}
        />
      ) : null}
      {editing?.kind === 'product' ? (
        <ProductDialog
          product={editing.product}
          onClose={() => {
            setEditing(null)
          }}
        />
      ) : null}
    </section>
  )
}
