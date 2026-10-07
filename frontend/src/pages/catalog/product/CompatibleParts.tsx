import { useQueries } from '@tanstack/react-query'
import { Link } from 'react-router'
import { api, unwrap } from '@/api/client'
import { isProductKind } from '@/catalog/filters'
import { KIND_LABELS } from '@/catalog/labels'
import { ProductCard, ProductCardSkeleton } from '@/components/catalog/ProductCard'

/** Which kinds a shopper looks at next, per kind: the parts this one constrains most. */
const RELATED: Record<string, string[]> = {
  cpu: ['motherboard', 'cooler'],
  motherboard: ['cpu', 'memory'],
  memory: ['motherboard'],
  gpu: ['psu', 'case'],
  storage: ['motherboard'],
  psu: ['gpu'],
  case: ['gpu', 'cooler'],
  cooler: ['cpu', 'case'],
}
const PER_KIND = 4

/**
 * Parts that work with this one, judged by the compatibility engine (compatible_with = this part),
 * in stock first. A starting point for a build, not a recommendation engine.
 */
export function CompatibleParts({ productId, kind }: { productId: number; kind: string }) {
  const kinds = (RELATED[kind] ?? []).filter(isProductKind)
  const results = useQueries({
    queries: kinds.map((related) => ({
      queryKey: ['products', 'related', productId, related],
      queryFn: () =>
        unwrap(
          api.GET('/api/v1/products', {
            params: {
              query: {
                kind: related,
                compatible_with: [productId],
                in_stock: true,
                sort: 'price',
                limit: PER_KIND,
              },
            },
          }),
        ),
      staleTime: 60_000,
    })),
  })
  if (!kinds.length) return null

  return (
    <div className="flex flex-col gap-8">
      {kinds.map((related, index) => {
        const result = results[index]
        const label = KIND_LABELS[related] ?? related
        if (result?.isError) return null
        if (result?.data && !result.data.items.length) return null
        return (
          <section key={related} aria-labelledby={`related-${related}`}>
            <div className="flex items-baseline justify-between gap-4">
              <h3 id={`related-${related}`} className="text-lg font-semibold text-ink">
                {label}
              </h3>
              <Link to={`/shop/${related}`} className="text-sm font-medium text-accent hover:underline">
                All {label.toLowerCase()}
              </Link>
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {result?.data
                ? result.data.items.map((product) => (
                    <li key={product.id} className="grid min-w-0">
                      <ProductCard product={product} />
                    </li>
                  ))
                : Array.from({ length: PER_KIND }, (_, i) => (
                    <li key={i} aria-hidden="true">
                      <ProductCardSkeleton />
                    </li>
                  ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
