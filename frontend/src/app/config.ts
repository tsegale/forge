import { queryOptions } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'

/** Store settings (currency, VAT, shipping, reservation hold, Stripe key); fixed per deploy. */
export const configQuery = queryOptions({
  queryKey: ['config'],
  queryFn: () => unwrap(api.GET('/api/v1/config')),
  staleTime: Infinity,
})
