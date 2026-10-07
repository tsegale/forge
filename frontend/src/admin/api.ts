import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { api, unwrap, type components } from '@/api/client'
import { withSession } from '@/auth/session'

export type AdminOrderDetail = components['schemas']['AdminOrderDetail']
export type AdminOrderSummary = components['schemas']['AdminOrderSummary']
export type AdminProductRow = components['schemas']['AdminProductRow']
export type FulfilmentStep = AdminOrderDetail['next_steps'][number]
type OrderStatus = components['schemas']['OrderStatus']

export const ADMIN_ORDERS_KEY = ['admin', 'orders'] as const
export const ADMIN_PRODUCTS_KEY = ['admin', 'products'] as const

export const adminOrdersQuery = (status: OrderStatus | null) =>
  infiniteQueryOptions({
    queryKey: [...ADMIN_ORDERS_KEY, 'list', status],
    queryFn: ({ pageParam }) =>
      withSession(() =>
        unwrap(
          api.GET('/api/v1/admin/orders', {
            params: {
              query: {
                limit: 25,
                ...(status ? { status } : {}),
                ...(pageParam ? { cursor: pageParam } : {}),
              },
            },
          }),
        ),
      ),
    initialPageParam: null as number | null,
    getNextPageParam: (page) => page.next_cursor ?? null,
  })

export const adminOrderQuery = (order_number: string) =>
  queryOptions({
    queryKey: [...ADMIN_ORDERS_KEY, order_number],
    queryFn: () =>
      withSession(() =>
        unwrap(api.GET('/api/v1/admin/orders/{order_number}', { params: { path: { order_number } } })),
      ),
  })

export const advanceOrder = (order_number: string, to: FulfilmentStep) =>
  withSession(() =>
    unwrap(
      api.POST('/api/v1/admin/orders/{order_number}/status', {
        params: { path: { order_number } },
        body: { to },
      }),
    ),
  )

export const refundOrder = (order_number: string, reason: string | null) =>
  withSession(() =>
    unwrap(
      api.POST('/api/v1/admin/orders/{order_number}/refund', {
        params: { path: { order_number } },
        body: { reason },
      }),
    ),
  )

export interface ProductFilter {
  kind: string | null
  q: string
  active: boolean | null
}

export const adminProductsQuery = (filter: ProductFilter) =>
  infiniteQueryOptions({
    queryKey: [...ADMIN_PRODUCTS_KEY, filter],
    queryFn: ({ pageParam }) =>
      withSession(() =>
        unwrap(
          api.GET('/api/v1/admin/products', {
            params: {
              query: {
                limit: 50,
                ...(filter.kind ? { kind: filter.kind } : {}),
                ...(filter.q ? { q: filter.q } : {}),
                ...(filter.active === null ? {} : { active: filter.active }),
                ...(pageParam ? { cursor: pageParam } : {}),
              },
            },
          }),
        ),
      ),
    initialPageParam: null as number | null,
    getNextPageParam: (page) => page.next_cursor ?? null,
  })

export const getInventory = (product_id: number) =>
  withSession(() =>
    unwrap(api.GET('/api/v1/admin/inventory/{product_id}', { params: { path: { product_id } } })),
  )

/**
 * Set stock on hand, conditional on the version the admin last saw (If-Match). A 412 means
 * someone else changed the stock in between; nothing was written.
 */
export const updateStock = (product_id: number, quantity_on_hand: number, version: number) =>
  withSession(() =>
    unwrap(
      api.PATCH('/api/v1/admin/inventory/{product_id}', {
        params: { path: { product_id } },
        body: { quantity_on_hand },
        headers: { 'If-Match': `"${String(version)}"` },
      }),
    ),
  )

export const updateProduct = (product_id: number, body: { price_cents?: number; is_active?: boolean }) =>
  withSession(() =>
    unwrap(
      api.PATCH('/api/v1/admin/products/{product_id}', {
        params: { path: { product_id } },
        // Only the fields being changed: the API rejects an explicit null. The cast is needed
        // because openapi-typescript marks every field with a default as required, which is
        // right for responses but not for this partial update.
        body: {
          ...(body.price_cents === undefined ? {} : { price_cents: body.price_cents }),
          ...(body.is_active === undefined ? {} : { is_active: body.is_active }),
        } as components['schemas']['ProductUpdate'],
      }),
    ),
  )

export type Metrics = components['schemas']['Metrics']
export type AuditKind = NonNullable<components['schemas']['AuditQuery']['kind']>

export const metricsQuery = (days: number) =>
  queryOptions({
    queryKey: ['admin', 'metrics', days],
    queryFn: () =>
      withSession(() => unwrap(api.GET('/api/v1/admin/metrics', { params: { query: { days } } }))),
    refetchInterval: 60_000,
  })

export const auditQuery = (kind: AuditKind | null) =>
  infiniteQueryOptions({
    queryKey: ['admin', 'audit', kind],
    queryFn: ({ pageParam }) =>
      withSession(() =>
        unwrap(
          api.GET('/api/v1/admin/audit', {
            params: {
              query: { limit: 50, ...(kind ? { kind } : {}), ...(pageParam ? { before: pageParam } : {}) },
            },
          }),
        ),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.next_before ?? null,
  })

export const webhooksQuery = infiniteQueryOptions({
  queryKey: ['admin', 'webhooks'],
  queryFn: ({ pageParam }) =>
    withSession(() =>
      unwrap(
        api.GET('/api/v1/admin/webhooks', {
          params: { query: { limit: 50, ...(pageParam ? { before: pageParam } : {}) } },
        }),
      ),
    ),
  initialPageParam: null as string | null,
  getNextPageParam: (page) => page.next_before ?? null,
})
