import type { AddressIn } from './api'

export interface AddressValues {
  recipient_name: string
  phone: string
  line1: string
  line2: string
  city: string
  region: string
  postal_code: string
  country_code: string
}

export const emptyAddress = (recipient_name = ''): AddressValues => ({
  recipient_name,
  phone: '',
  line1: '',
  line2: '',
  city: '',
  region: '',
  postal_code: '',
  country_code: 'NA',
})

/** Form values to the API shape: blank optional fields are left out rather than sent empty. */
export function toAddressIn(values: AddressValues): AddressIn {
  const optional = (value: string) => (value.trim() ? value.trim() : null)
  return {
    recipient_name: values.recipient_name.trim(),
    phone: optional(values.phone),
    line1: values.line1.trim(),
    line2: optional(values.line2),
    city: values.city.trim(),
    region: optional(values.region),
    postal_code: optional(values.postal_code),
    country_code: values.country_code.trim().toUpperCase() || 'NA',
  }
}

/** One line for a shipping address: "12 Independence Avenue, Windhoek, NA". */
export function formatAddress(address: {
  line1: string
  line2?: string | null
  city: string
  region?: string | null
  postal_code?: string | null
  country_code: string
}): string {
  return [
    address.line1,
    address.line2,
    address.city,
    address.region,
    address.postal_code,
    address.country_code,
  ]
    .filter(Boolean)
    .join(', ')
}
