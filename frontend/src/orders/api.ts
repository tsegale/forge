import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { api, unwrap, type components } from '@/api/client'
import { withSession } from '@/auth/session'

export type Address = components['schemas']['AddressResponse']
export type AddressIn = components['schemas']['AddressIn']
export type CheckoutRequest = components['schemas']['CheckoutRequest']
export type OrderDetail = components['schemas']['OrderDetail']

export const addressesQuery = queryOptions({
  queryKey: ['addresses'],
  queryFn: () => withSession(() => unwrap(api.GET('/api/v1/addresses'))),
})

export const createAddress = (body: components['schemas']['AddressCreate']) =>
  withSession(() => unwrap(api.POST('/api/v1/addresses', { body })))

/** Reserve stock and create the order; payment is started separately on the pay screen. */
export const placeOrder = (body: CheckoutRequest) =>
  withSession(() => unwrap(api.POST('/api/v1/checkout', { body })))

export type OrderStatusFilter = components['schemas']['OrderStatus'] | null

/** The customer's orders, newest first, a page at a time (cursor = last order id seen). */
export const ordersQuery = (status: OrderStatusFilter) =>
  infiniteQueryOptions({
    queryKey: ['orders', 'list', status],
    queryFn: ({ pageParam }) =>
      withSession(() =>
        unwrap(
          api.GET('/api/v1/orders', {
            params: {
              query: {
                limit: 20,
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

export const orderQuery = (order_number: string) =>
  queryOptions({
    queryKey: ['orders', order_number],
    queryFn: () =>
      withSession(() =>
        unwrap(api.GET('/api/v1/orders/{order_number}', { params: { path: { order_number } } })),
      ),
  })

/** The PaymentIntent's client secret. Idempotent: the same intent comes back every time. */
export const startPayment = (order_number: string) =>
  withSession(() =>
    unwrap(api.POST('/api/v1/orders/{order_number}/payment', { params: { path: { order_number } } })),
  )

export const cancelOrder = (order_number: string) =>
  withSession(() =>
    unwrap(api.POST('/api/v1/orders/{order_number}/cancel', { params: { path: { order_number } } })),
  )

export const reorder = (order_number: string) =>
  withSession(() =>
    unwrap(api.POST('/api/v1/orders/{order_number}/reorder', { params: { path: { order_number } } })),
  )
