import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap, type components } from '@/api/client'
import { useAuth } from '@/auth/context'
import { withSession } from '@/auth/session'
import { addressesQuery, type Address, type AddressIn } from '@/orders/api'

export type PriceAlert = components['schemas']['PriceAlertResponse']
type AddressUpdate = components['schemas']['AddressUpdate']

export const alertsQuery = (userId: number | undefined) =>
  queryOptions({
    queryKey: ['alerts', userId],
    queryFn: () => withSession(() => unwrap(api.GET('/api/v1/alerts'))),
    enabled: userId !== undefined,
  })

/** The signed-in customer's alerts (empty while signed out). */
export function useAlerts() {
  const { user } = useAuth()
  return useQuery(alertsQuery(user?.id))
}

export function useSetAlert() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { product_id: number; target_price_cents: number }) =>
      withSession(() => unwrap(api.POST('/api/v1/alerts', { body }))),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  })
}

export function useDeleteAlert() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (alert_id: number) =>
      withSession(() => unwrap(api.DELETE('/api/v1/alerts/{alert_id}', { params: { path: { alert_id } } }))),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  })
}

export const updateProfile = (body: { first_name: string; last_name: string }) =>
  withSession(() => unwrap(api.PATCH('/api/v1/auth/me', { body })))

export const changePassword = (body: { current_password: string; new_password: string }) =>
  withSession(() => unwrap(api.POST('/api/v1/auth/me/password', { body })))

function useAddressMutation<T>(write: (args: T) => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: write,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: addressesQuery.queryKey }),
  })
}

export function useSaveAddress() {
  return useAddressMutation(
    ({ id, body, isDefault }: { id: number | null; body: AddressIn; isDefault: boolean }) =>
      withSession(() =>
        unwrap(
          id === null
            ? api.POST('/api/v1/addresses', { body: { ...body, type: 'shipping', is_default: isDefault } })
            : api.PATCH('/api/v1/addresses/{address_id}', {
                params: { path: { address_id: id } },
                body: { ...body, is_default: isDefault },
              }),
        ),
      ),
  )
}

export function useMakeDefault() {
  return useAddressMutation((address: Address) =>
    withSession(() =>
      unwrap(
        api.PATCH('/api/v1/addresses/{address_id}', {
          params: { path: { address_id: address.id } },
          // A partial update: the generated type marks every field required, but the API takes any subset.
          body: { is_default: true } as AddressUpdate,
        }),
      ),
    ),
  )
}

export function useDeleteAddress() {
  return useAddressMutation((address_id: number) =>
    withSession(() =>
      unwrap(api.DELETE('/api/v1/addresses/{address_id}', { params: { path: { address_id } } })),
    ),
  )
}
