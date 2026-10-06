import {
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { api, unwrap, type components } from '@/api/client'
import { withSession } from '@/auth/session'

export type Review = components['schemas']['ReviewResponse']
export type ReviewSort = NonNullable<components['schemas']['ReviewQuery']['sort']>
export type ReviewInput = components['schemas']['ReviewCreate']

const PAGE_SIZE = 5

export const reviewsKey = (slug: string) => ['reviews', slug] as const

export const reviewsQuery = (slug: string, sort: ReviewSort, verifiedOnly: boolean) =>
  infiniteQueryOptions({
    queryKey: [...reviewsKey(slug), sort, verifiedOnly],
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET('/api/v1/products/{slug}/reviews', {
          params: {
            path: { slug },
            query: {
              sort,
              verified_only: verifiedOnly,
              limit: PAGE_SIZE,
              ...(pageParam ? { cursor: pageParam } : {}),
            },
          },
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.next_cursor ?? null,
    placeholderData: keepPreviousData,
  })

/** The signed-in customer's own review, or null when they have not written one. */
export const myReviewQuery = (slug: string, userId: number | undefined) =>
  queryOptions({
    queryKey: [...reviewsKey(slug), 'mine', userId],
    queryFn: async () =>
      (
        await withSession(() =>
          unwrap(api.GET('/api/v1/products/{slug}/reviews/mine', { params: { path: { slug } } })),
        )
      ).review,
    enabled: userId !== undefined,
  })

export const priceHistoryQuery = (slug: string, days: number) =>
  queryOptions({
    queryKey: ['price-history', slug, days],
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/products/{slug}/price-history', { params: { path: { slug }, query: { days } } }),
      ),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  })

/** Write or edit the customer's review; the product's reviews and rating are refetched after. */
export function useSaveReview(slug: string, existing: Review | null | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ReviewInput) =>
      withSession(() =>
        unwrap(
          existing
            ? api.PATCH('/api/v1/reviews/{review_id}', {
                params: { path: { review_id: existing.id } },
                body: input,
              })
            : api.POST('/api/v1/products/{slug}/reviews', { params: { path: { slug } }, body: input }),
        ),
      ),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: reviewsKey(slug) }),
        queryClient.invalidateQueries({ queryKey: ['product', slug] }),
      ]),
  })
}

export function useDeleteReview(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (reviewId: number) =>
      withSession(() =>
        unwrap(api.DELETE('/api/v1/reviews/{review_id}', { params: { path: { review_id: reviewId } } })),
      ),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: reviewsKey(slug) }),
        queryClient.invalidateQueries({ queryKey: ['product', slug] }),
      ]),
  })
}
