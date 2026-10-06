import { queryOptions } from '@tanstack/react-query'
import { api, unwrap, type components } from '@/api/client'

export type PriceDrop = components['schemas']['PriceDrop']
export type FeaturedBuild = components['schemas']['FeaturedBuild']

export const priceDropsQuery = queryOptions({
  queryKey: ['home', 'price-drops'],
  queryFn: () =>
    unwrap(api.GET('/api/v1/products/price-drops', { params: { query: { limit: 8, days: 30 } } })),
  staleTime: 5 * 60_000,
})

export const backInStockQuery = queryOptions({
  queryKey: ['home', 'back-in-stock'],
  queryFn: () =>
    unwrap(api.GET('/api/v1/products/back-in-stock', { params: { query: { limit: 4, days: 30 } } })),
  staleTime: 5 * 60_000,
})

export const featuredBuildsQuery = queryOptions({
  queryKey: ['home', 'featured-builds'],
  queryFn: () => unwrap(api.GET('/api/v1/builds/featured')),
  staleTime: 5 * 60_000,
})
