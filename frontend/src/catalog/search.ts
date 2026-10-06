import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'

/** Search-as-you-type suggestions; keeps the previous results on screen while the next load. */
export const suggestQuery = (q: string) =>
  queryOptions({
    queryKey: ['search', 'suggest', q],
    queryFn: ({ signal }) =>
      unwrap(api.GET('/api/v1/search/suggest', { params: { query: { q, per_kind: 3 } }, signal })),
    enabled: q.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })

/** Where a full search goes. */
export function searchHref(q: string): string {
  return `/search?q=${encodeURIComponent(q.trim())}`
}
