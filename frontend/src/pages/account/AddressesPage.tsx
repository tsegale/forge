import { useQuery } from '@tanstack/react-query'
import { MapPin, Plus } from 'lucide-react'
import { useState, type SyntheticEvent } from 'react'
import { useDeleteAddress, useMakeDefault, useSaveAddress } from '@/account/api'
import { ApiError } from '@/api/errors'
import { useAuth } from '@/auth/context'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { Checkbox } from '@/components/ui/Field'
import { Skeleton } from '@/components/ui/Skeleton'
import { toast } from '@/components/ui/toastStore'
import { usePageTitle } from '@/lib/usePageTitle'
import { emptyAddress, formatAddress, toAddressIn, type AddressValues } from '@/orders/address'
import { addressesQuery, type Address } from '@/orders/api'
import { AddressForm } from '@/pages/checkout/AddressForm'

function toValues(address: Address): AddressValues {
  return {
    recipient_name: address.recipient_name,
    phone: address.phone ?? '',
    line1: address.line1,
    line2: address.line2 ?? '',
    city: address.city,
    region: address.region ?? '',
    postal_code: address.postal_code ?? '',
    country_code: address.country_code,
  }
}

function AddressDialog({
  address,
  fallbackName,
  first,
  onClose,
}: {
  address: Address | null
  fallbackName: string
  first: boolean
  onClose: () => void
}) {
  const [values, setValues] = useState<AddressValues>(() =>
    address ? toValues(address) : emptyAddress(fallbackName),
  )
  const [isDefault, setIsDefault] = useState(address?.is_default ?? first)
  const save = useSaveAddress()
  const errors = save.error instanceof ApiError ? save.error.fieldErrors() : {}
  const submit = (event: SyntheticEvent) => {
    event.preventDefault()
    save.mutate(
      { id: address?.id ?? null, body: toAddressIn(values), isDefault },
      {
        onSuccess: () => {
          toast({ title: address ? 'Address updated' : 'Address added' })
          onClose()
        },
      },
    )
  }
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      {save.error && !Object.keys(errors).length ? <ErrorMessage error={save.error} /> : null}
      <AddressForm values={values} onChange={setValues} errors={errors} />
      <Checkbox
        label="Use as my default delivery address"
        checked={isDefault}
        disabled={address?.is_default}
        onChange={(event) => {
          setIsDefault(event.target.checked)
        }}
      />
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" busy={save.isPending}>
          {address ? 'Save changes' : 'Add address'}
        </Button>
      </div>
    </form>
  )
}

/** Saved delivery addresses: add, edit, choose the default, delete. Orders keep their own copy. */
export function AddressesPage() {
  usePageTitle('Addresses')
  const { user } = useAuth()
  const addresses = useQuery(addressesQuery)
  const [editing, setEditing] = useState<Address | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Address | null>(null)
  const makeDefault = useMakeDefault()
  const remove = useDeleteAddress()
  const items = addresses.data?.items ?? []
  const fallbackName = user ? `${user.first_name} ${user.last_name}` : ''

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Addresses</h1>
          <p className="mt-1 text-base text-ink-muted">
            Where we deliver. Past orders keep the address they were sent to.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing('new')
          }}
        >
          <Plus aria-hidden="true" className="h-4 w-4" /> Add an address
        </Button>
      </div>
      <ErrorMessage error={addresses.error ?? makeDefault.error ?? remove.error} />
      {addresses.isPending ? (
        <Skeleton className="h-36 w-full" />
      ) : items.length ? (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {items.map((address) => (
            <li key={address.id} className="flex flex-col rounded-md border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium text-ink">{address.recipient_name}</p>
                {address.is_default ? <Badge tone="accent">Default</Badge> : null}
              </div>
              <p className="mt-1 text-sm text-ink-muted">{formatAddress(address)}</p>
              {address.phone ? <p className="text-sm text-ink-muted">{address.phone}</p> : null}
              <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-4 text-sm">
                <button
                  type="button"
                  className="font-medium text-accent hover:underline"
                  aria-label={`Edit the address for ${address.recipient_name}, ${address.line1}`}
                  onClick={() => {
                    setEditing(address)
                  }}
                >
                  Edit
                </button>
                {address.is_default ? null : (
                  <button
                    type="button"
                    className="font-medium text-accent hover:underline"
                    aria-label={`Make ${address.line1} the default`}
                    onClick={() => {
                      makeDefault.mutate(address)
                    }}
                  >
                    Make default
                  </button>
                )}
                <button
                  type="button"
                  className="font-medium text-ink-muted hover:text-danger-ink hover:underline"
                  aria-label={`Delete the address ${address.line1}`}
                  onClick={() => {
                    setDeleting(address)
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={MapPin} title="No saved addresses">
          <p>Add one now, or save it at checkout.</p>
        </EmptyState>
      )}

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        title={editing === 'new' ? 'Add an address' : 'Edit address'}
        size="lg"
      >
        {editing !== null ? (
          <AddressDialog
            address={editing === 'new' ? null : editing}
            fallbackName={fallbackName}
            first={items.length === 0}
            onClose={() => {
              setEditing(null)
            }}
          />
        ) : null}
      </Dialog>

      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title="Delete this address?"
        description={deleting ? formatAddress(deleting) : undefined}
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setDeleting(null)
              }}
            >
              Keep it
            </Button>
            <Button
              variant="danger"
              busy={remove.isPending}
              onClick={() => {
                if (!deleting) return
                remove.mutate(deleting.id, {
                  onSuccess: () => {
                    setDeleting(null)
                    toast({ tone: 'info', title: 'Address deleted' })
                  },
                })
              }}
            >
              Delete
            </Button>
          </div>
        }
      >
        <p className="text-base text-ink-muted">Past orders sent here are not affected.</p>
      </Dialog>
    </div>
  )
}
