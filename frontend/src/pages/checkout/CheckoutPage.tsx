import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type SyntheticEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ApiError } from '@/api/errors'
import { configQuery } from '@/app/config'
import { useAuth } from '@/auth/context'
import { buildQuery } from '@/builds/api'
import { CART_KEY, useCart } from '@/cart/api'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { formatCents, formatPrice } from '@/lib/money'
import { addressesQuery, createAddress, placeOrder, type Address, type CheckoutRequest } from '@/orders/api'
import { TotalsTable } from '@/pages/cart/TotalsTable'
import { emptyAddress, toAddressIn, type AddressValues } from '@/orders/address'
import { AddressForm } from './AddressForm'

interface Line {
  key: number
  productId: number
  name: string
  quantity: number
  lineTotal: { amount_cents: number; currency: string }
}

interface ShortLine {
  product_id: number
  requested: number
  available: number
}

const NEW = 'new'

function isShortLine(value: unknown): value is ShortLine {
  return typeof value === 'object' && value !== null && 'product_id' in value && 'available' in value
}

function formatAddress(address: Address): string {
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

/** Strip the checkout prefix from address field errors ("address.city" becomes "city"). */
function addressErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {}
  const out: Record<string, string> = {}
  for (const [field, message] of Object.entries(error.fieldErrors())) {
    out[field.replace(/^address\./, '')] = message
  }
  return out
}

export function CheckoutPage() {
  const [params] = useSearchParams()
  const buildId = Number(params.get('build')) || null
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const cart = useCart({ enabled: buildId === null })
  const build = useQuery({ ...buildQuery(buildId ?? 0), enabled: buildId !== null })
  const addresses = useQuery(addressesQuery)
  const config = useQuery(configQuery)

  const [choice, setChoice] = useState<string | null>(null)
  const [address, setAddress] = useState<AddressValues>(() =>
    emptyAddress(user ? `${user.first_name} ${user.last_name}` : ''),
  )
  const [saveAddress, setSaveAddress] = useState(true)

  const saved = addresses.data?.items ?? []
  const preferred = saved.find((a) => a.type === 'shipping' && a.is_default) ?? saved[0]
  const selected = choice ?? (preferred ? String(preferred.id) : NEW)

  const submit = useMutation({
    mutationFn: async () => {
      const source: CheckoutRequest['source'] = buildId === null ? 'cart' : { build_id: buildId }
      if (selected !== NEW) return placeOrder({ source, address_id: Number(selected), address: null })
      const body = toAddressIn(address)
      if (!saveAddress) return placeOrder({ source, address: body, address_id: null })
      const created = await createAddress({ ...body, type: 'shipping', is_default: saved.length === 0 })
      void queryClient.invalidateQueries({ queryKey: addressesQuery.queryKey })
      setChoice(String(created.id))
      return placeOrder({ source, address_id: created.id, address: null })
    },
    onSuccess: (order) => {
      void queryClient.invalidateQueries({ queryKey: CART_KEY })
      void queryClient.invalidateQueries({ queryKey: ['builds'] })
      void navigate(`/orders/${order.order_number}/pay`, { replace: true })
    },
  })

  const source = buildId === null ? cart : build
  if (source.isPending || addresses.isPending) return <p className="text-sm text-ink-muted">Loading</p>
  if (source.isError) return <ErrorMessage error={source.error} />
  if (addresses.isError) return <ErrorMessage error={addresses.error} />

  const lines: Line[] =
    buildId === null
      ? (cart.data?.items ?? []).map((line) => ({
          key: line.id,
          productId: line.product.id,
          name: line.product.name,
          quantity: line.quantity,
          lineTotal: line.line_total,
        }))
      : (build.data?.items ?? []).map((item) => ({
          key: item.id,
          productId: item.product.id,
          name: item.product.name,
          quantity: item.quantity,
          lineTotal: item.line_total,
        }))

  if (!lines.length) {
    return (
      <section className="py-16 text-center">
        <h1 className="text-2xl font-semibold">Nothing to check out</h1>
        <p className="mt-2 text-ink-muted">Your cart is empty.</p>
        <Button asChild className="mt-6">
          <Link to="/">Browse the catalog</Link>
        </Button>
      </section>
    )
  }

  const notValidated = buildId !== null && build.data?.status !== 'validated'
  const error = submit.error instanceof ApiError ? submit.error : null
  const short = new Map(
    error?.code === 'insufficient_stock' && Array.isArray(error.details)
      ? (error.details as unknown[]).filter(isShortLine).map((s) => [s.product_id, s])
      : [],
  )
  const fieldErrors = selected === NEW ? addressErrors(submit.error) : {}

  const goods = lines.reduce((sum, line) => sum + line.lineTotal.amount_cents, 0)
  const shipping = config.data
    ? goods >= config.data.shipping.free_threshold_cents
      ? 0
      : config.data.shipping.flat_cents
    : null

  const onSubmit = (event: SyntheticEvent) => {
    event.preventDefault()
    submit.mutate()
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_22rem]" noValidate>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold">Checkout</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {buildId === null ? 'Your cart' : `Build: ${build.data?.name ?? ''}`}
          </p>
        </div>

        {notValidated ? (
          <Alert tone="warning" title="This build is not validated">
            Only a validated build can be checked out.{' '}
            <Link to="/configurator" className="font-medium text-accent hover:underline">
              Back to the configurator
            </Link>
          </Alert>
        ) : null}

        <section aria-labelledby="ship-heading" className="space-y-4">
          <h2 id="ship-heading" className="text-lg font-semibold">
            Shipping address
          </h2>
          <div role="radiogroup" aria-labelledby="ship-heading" className="space-y-2">
            {saved.map((a) => (
              <label
                key={a.id}
                className="flex cursor-pointer gap-3 rounded-md border border-border bg-surface p-3 has-[:checked]:border-accent"
              >
                <input
                  type="radio"
                  name="address"
                  value={a.id}
                  checked={selected === String(a.id)}
                  onChange={() => {
                    setChoice(String(a.id))
                  }}
                />
                <span className="text-sm">
                  <span className="font-medium">{a.recipient_name}</span>
                  <span className="block text-ink-muted">{formatAddress(a)}</span>
                </span>
              </label>
            ))}
            <label className="flex cursor-pointer gap-3 rounded-md border border-border bg-surface p-3 has-[:checked]:border-accent">
              <input
                type="radio"
                name="address"
                value={NEW}
                checked={selected === NEW}
                onChange={() => {
                  setChoice(NEW)
                }}
              />
              <span className="text-sm font-medium">Use a new address</span>
            </label>
          </div>
          {selected === NEW ? (
            <div className="space-y-4 rounded-[var(--radius-card)] border border-border bg-surface p-5">
              <AddressForm values={address} onChange={setAddress} errors={fieldErrors} />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={saveAddress}
                  onChange={(event) => {
                    setSaveAddress(event.target.checked)
                  }}
                />
                Save this address for next time
              </label>
            </div>
          ) : null}
        </section>
      </div>

      <aside
        aria-label="Order summary"
        className="h-fit space-y-4 rounded-[var(--radius-card)] border border-border bg-surface p-5"
      >
        <h2 className="text-sm font-semibold">Order summary</h2>
        <ul className="space-y-2 text-sm">
          {lines.map((line) => {
            const shortLine = short.get(line.productId)
            return (
              <li key={line.key}>
                <div className="flex justify-between gap-3">
                  <span>
                    {line.quantity > 1 ? `${String(line.quantity)} x ` : ''}
                    {line.name}
                  </span>
                  <span className="shrink-0 tabular">{formatPrice(line.lineTotal)}</span>
                </div>
                {shortLine ? (
                  <p className="text-xs text-danger">
                    Only {shortLine.available} available, you asked for {shortLine.requested}.
                  </p>
                ) : null}
              </li>
            )
          })}
        </ul>
        <div className="border-t border-border pt-4">
          {buildId === null && cart.data ? (
            <TotalsTable totals={cart.data.totals} />
          ) : (
            <>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Parts</dt>
                  <dd className="tabular">{formatCents(goods)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Shipping</dt>
                  <dd className="tabular">
                    {shipping === null ? '' : shipping === 0 ? 'Free' : formatCents(shipping)}
                  </dd>
                </div>
                <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
                  <dt>Total</dt>
                  <dd className="tabular">{shipping === null ? '' : formatCents(goods + shipping)}</dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-ink-subtle">VAT included.</p>
            </>
          )}
        </div>
        {short.size ? (
          <Alert tone="danger" title="Some parts are no longer available in that quantity">
            {buildId === null ? (
              <Link to="/cart" className="font-medium text-accent hover:underline">
                Update your cart
              </Link>
            ) : (
              <Link to="/configurator" className="font-medium text-accent hover:underline">
                Change your build
              </Link>
            )}
          </Alert>
        ) : error && error.status !== 422 ? (
          <ErrorMessage error={error} />
        ) : submit.error && !(submit.error instanceof ApiError) ? (
          <ErrorMessage error={submit.error} />
        ) : null}
        {error?.status === 422 && !Object.keys(fieldErrors).length ? <ErrorMessage error={error} /> : null}
        <Button type="submit" className="w-full" busy={submit.isPending} disabled={notValidated}>
          {submit.isPending ? 'Reserving your parts' : 'Place order and pay'}
        </Button>
        <p className="text-xs text-ink-subtle">
          Your parts are held for{' '}
          {config.data
            ? `${String(Math.round(config.data.reservation_ttl_seconds / 60))} minutes`
            : 'a while'}{' '}
          while you pay.
        </p>
      </aside>
    </form>
  )
}
