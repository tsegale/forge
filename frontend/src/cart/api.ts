import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap, type components } from '@/api/client'
import { useSessionKey, type SessionKey } from '@/auth/context'
import { withSession } from '@/auth/session'

export type Cart = components['schemas']['CartResponse']

/** Prefix of every cart query, for invalidation. */
export const CART_KEY = ['cart'] as const

/**
 * The caller's cart: a guest's (cart cookie) or the signed-in user's. Keyed by session, so a
 * cart fetched as a guest is never shown once the session is restored or changes.
 */
export const cartQuery = (session: SessionKey) =>
  queryOptions({
    queryKey: [...CART_KEY, session],
    queryFn: () => withSession(() => unwrap(api.GET('/api/v1/cart'))),
    enabled: session !== null,
  })

export function useCart({ enabled = true }: { enabled?: boolean } = {}) {
  const session = useSessionKey()
  return useQuery({ ...cartQuery(session), enabled: enabled && session !== null })
}

/** Replace the cached cart for the current session (every cart write returns the whole cart). */
export function useSetCart() {
  const queryClient = useQueryClient()
  const session = useSessionKey()
  return (cart: Cart) => {
    queryClient.setQueryData(cartQuery(session).queryKey, cart)
  }
}

export const addToCart = (product_id: number, quantity = 1) =>
  withSession(() => unwrap(api.POST('/api/v1/cart/items', { body: { product_id, quantity } })))

export const setCartQuantity = (item_id: number, quantity: number) =>
  withSession(() =>
    unwrap(
      api.PATCH('/api/v1/cart/items/{item_id}', {
        params: { path: { item_id } },
        body: { quantity },
      }),
    ),
  )

export const removeCartLine = (item_id: number) =>
  withSession(() => unwrap(api.DELETE('/api/v1/cart/items/{item_id}', { params: { path: { item_id } } })))

/** A cart mutation whose result becomes the cached cart. */
export function useCartMutation<TArgs>(write: (args: TArgs) => Promise<Cart>) {
  const setCart = useSetCart()
  return useMutation({ mutationFn: write, onSuccess: setCart })
}
