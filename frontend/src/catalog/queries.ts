import { infiniteQueryOptions, keepPreviousData, queryOptions } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'
import type { ProductQuery } from './filters'

const PAGE_SIZE = 24

export const productsQuery = (query: Partial<ProductQuery>) =>
  infiniteQueryOptions({
    queryKey: ['products', query],
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET('/api/v1/products', {
          params: { query: { ...query, limit: PAGE_SIZE, ...(pageParam ? { cursor: pageParam } : {}) } },
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.next_cursor ?? null,
    // Keep the current results on screen while a changed filter loads: no flash, no layout shift.
    placeholderData: keepPreviousData,
  })

/** Counts for the filter sidebar, from the same filters as the listing (no sort or paging). */
export const facetsQuery = (query: Partial<ProductQuery>) => {
  const filters = { ...query }
  delete filters.sort
  delete filters.include_incompatible
  return queryOptions({
    queryKey: ['products', 'facets', filters],
    queryFn: () => unwrap(api.GET('/api/v1/products/facets', { params: { query: filters } })),
    placeholderData: keepPreviousData,
  })
}

export const productQuery = (slug: string) =>
  queryOptions({
    queryKey: ['product', slug],
    queryFn: () => unwrap(api.GET('/api/v1/products/{slug}', { params: { path: { slug } } })),
  })

export const componentKindsQuery = queryOptions({
  queryKey: ['component-kinds'],
  queryFn: () => unwrap(api.GET('/api/v1/component-kinds')),
  staleTime: Infinity,
})
