import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { queryFromSearch, SORTS, SPEC_FILTERS } from '@/catalog/filters'
import { KIND_LABELS } from '@/catalog/labels'
import { componentKindsQuery, productsQuery } from '@/catalog/queries'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { FilterPanel } from './FilterPanel'
import { ProductCard } from './ProductCard'

const SEARCH_DEBOUNCE_MS = 300

export function CatalogPage() {
  const [params, setParams] = useSearchParams()
  const query = useMemo(() => queryFromSearch(params), [params])
  const kinds = useQuery(componentKindsQuery)
  const products = useInfiniteQuery(productsQuery(query))
  const [search, setSearch] = useState(params.get('q') ?? '')

  function update(key: string, value: string | null) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value === null || value === '') next.delete(key)
        else next.set(key, value)
        if (key === 'kind') for (const def of Object.values(SPEC_FILTERS).flat()) next.delete(def.key)
        return next
      },
      { replace: key === 'q' },
    )
  }

  // Debounced search: the URL (and so the query) updates once typing pauses.
  useEffect(() => {
    const handle = setTimeout(() => {
      setParams(
        (prev) => {
          const wanted = search.trim()
          if ((prev.get('q') ?? '') === wanted) return prev
          const next = new URLSearchParams(prev)
          if (wanted) next.set('q', wanted)
          else next.delete('q')
          return next
        },
        { replace: true },
      )
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      clearTimeout(handle)
    }
  }, [search, setParams])

  const items = products.data?.pages.flatMap((page) => page.items) ?? []
  const activeKind = params.get('kind') ?? undefined
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {activeKind ? (KIND_LABELS[activeKind] ?? 'Catalog') : 'Catalog'}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Every part is checked for compatibility when you add it to a build.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="relative">
            <span className="sr-only">Search products</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-ink-subtle"
            />
            <input
              type="search"
              placeholder="Search, for example x3d"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
              }}
              className="w-72 rounded-md border border-border-strong bg-surface py-2 pr-3 pl-9 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            Sort
            <select
              value={params.get('sort') ?? ''}
              onChange={(e) => {
                update('sort', e.target.value || null)
              }}
              className="rounded-md border border-border-strong bg-surface px-2 py-2 text-sm text-ink"
            >
              <option value="">{params.get('q') ? 'Relevance' : 'Name'}</option>
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <nav aria-label="Categories" className="flex flex-wrap gap-2">
        {[
          { code: '', label: 'All parts' },
          ...(kinds.data?.items ?? []).map((k) => ({ code: k.code, label: KIND_LABELS[k.code] ?? k.label })),
        ].map((k) => {
          const active = (activeKind ?? '') === k.code
          return (
            <button
              key={k.code || 'all'}
              type="button"
              aria-pressed={active}
              onClick={() => {
                update('kind', k.code || null)
              }}
              className={`rounded-full border px-3 py-1 text-sm ${
                active
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-border bg-surface text-ink-muted hover:text-ink'
              }`}
            >
              {k.label}
            </button>
          )
        })}
      </nav>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-[14rem_1fr]">
        <FilterPanel kind={activeKind} params={params} onChange={update} />
        <section aria-label="Products" aria-busy={products.isPending}>
          {products.isError ? <ErrorMessage error={products.error} /> : null}
          {!products.isPending && !products.isError && !items.length ? (
            <p className="text-sm text-ink-muted">
              No products match. Try fewer filters or a different search.
            </p>
          ) : null}
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </ul>
          {products.hasNextPage ? (
            <div className="mt-6 text-center">
              <Button
                variant="secondary"
                busy={products.isFetchingNextPage}
                onClick={() => void products.fetchNextPage()}
              >
                Load more
              </Button>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  )
}
