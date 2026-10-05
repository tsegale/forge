import type { AddressValues } from '@/orders/address'
import { Field } from '@/components/ui/Field'

/** A shipping address. `errors` is keyed by field name (the API's paths, without a prefix). */
export function AddressForm({
  values,
  onChange,
  errors,
}: {
  values: AddressValues
  onChange: (values: AddressValues) => void
  errors: Record<string, string>
}) {
  const field = (key: keyof AddressValues) => ({
    value: values[key],
    error: errors[key],
    onChange: (event: { target: { value: string } }) => {
      onChange({ ...values, [key]: event.target.value })
    },
  })
  return (
    <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <legend className="sr-only">New address</legend>
      <Field label="Recipient name" autoComplete="name" required {...field('recipient_name')} />
      <Field label="Phone (optional)" type="tel" autoComplete="tel" {...field('phone')} />
      <Field
        label="Street address"
        autoComplete="address-line1"
        required
        className="sm:col-span-2"
        {...field('line1')}
      />
      <Field
        label="Apartment, unit or building (optional)"
        autoComplete="address-line2"
        className="sm:col-span-2"
        {...field('line2')}
      />
      <Field label="City or town" autoComplete="address-level2" required {...field('city')} />
      <Field label="Region (optional)" autoComplete="address-level1" {...field('region')} />
      <Field label="Postal code (optional)" autoComplete="postal-code" {...field('postal_code')} />
      <Field
        label="Country code"
        autoComplete="country"
        maxLength={2}
        hint="Two letters, for example NA for Namibia."
        required
        {...field('country_code')}
      />
    </fieldset>
  )
}
