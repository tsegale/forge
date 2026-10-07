import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Clock, MapPin, ShoppingCart, Truck } from 'lucide-react'
import { useEffect, useRef, useState, type SyntheticEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ApiError } from '@/api/errors'
import { configQuery } from '@/app/config'
import { useAuth } from '@/auth/context'
import { buildQuery } from '@/builds/api'
import { CART_KEY, useCart } from '@/cart/api'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { Checkbox } from '@/components/ui/Field'
import { Skeleton } from '@/components/ui/Skeleton'
import { Stepper } from '@/components/ui/Stepper'
import { cn } from '@/lib/cn'
import { formatCents } from '@/lib/money'
import { usePageTitle } from '@/lib/usePageTitle'
import { emptyAddress, formatAddress, toAddressIn, type AddressValues } from '@/orders/address'
import { addressesQuery, createAddress, placeOrder, type CheckoutRequest } from '@/orders/api'
import { TotalsTable } from '@/pages/cart/TotalsTable'
import { AddressForm } from './AddressForm'
import { OrderSummary, type SummaryLine } from './OrderSummary'
import { CHECKOUT_STEPS } from './steps'

interface ShortLine {
  product_id: number
  requested: number
  available: number
}

const NEW = 'new'
const REQUIRED: (keyof AddressValues)[] = ['recipient_name', 'line1', 'city', 'country_code']
const REQUIRED_MESSAGES: Partial<Record<keyof AddressValues, string>> = {
  recipient_name: 'Enter the name of the person receiving the parcel.',
  line1: 'Enter a street address.',
  city: 'Enter a city or town.',
  country_code: 'Enter a two-letter country code, for example NA.',
}

function isShortLine(value: unknown): value is ShortLine {
  return typeof value === 'object' && value !== null && 'product_id' in value && 'available' in value
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

/** The same checks the API makes on the required fields, so the customer hears about them before review. */
function validateAddress(values: AddressValues): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const key of REQUIRED) if (!values[key].trim()) errors[key] = REQUIRED_MESSAGES[key] ?? 'Required.'
  if (values.country_code.trim() && !/^[A-Za-z]{2}$/.test(values.country_code.trim())) {
    errors.country_code = 'Use the two-letter code, for example NA for Namibia.'
  }
  return errors
}

/**
 * Checkout in two steps before payment: where it goes (a saved address or a new one), then a
 * review of address, delivery and totals. "Place order and pay" reserves the stock and opens the
 * payment step. The step is in the URL, so Back returns to the delivery step.
 */
export function CheckoutPage() {
  const [params, setParams] = useSearchParams()
  const buildId = Number(params.get('build')) || null
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  usePageTitle('Checkout')

  const cart = useCart({ enabled: buildId === null })
  const build = useQuery({ ...buildQuery(buildId ?? 0), enabled: buildId !== null })
  const addresses = useQuery(addressesQuery)
  const config = useQuery(configQuery)

  const [choice, setChoice] = useState<string | null>(null)
  const [address, setAddress] = useState<AddressValues>(() =>
    emptyAddress(user ? `${user.first_name} ${user.last_name}` : ''),
  )
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({})
  const [saveAddress, setSaveAddress] = useState(true)
  const headingRef = useRef<HTMLHeadingElement>(null)

  const saved = addresses.data?.items ?? []
  const preferred = saved.find((a) => a.type === 'shipping' && a.is_default) ?? saved[0]
  const selected = choice ?? (preferred ? String(preferred.id) : NEW)
  const newAddressReady = Object.keys(validateAddress(address)).length === 0
  // A reload on the review step keeps a saved address but not unsaved form values.
  const step =
    params.get('step') === 'review' && (selected !== NEW || newAddressReady) ? 'review' : 'delivery'

  const goTo = (next: 'delivery' | 'review') => {
    setParams(
      (current) => {
        const updated = new URLSearchParams(current)
        if (next === 'review') updated.set('step', 'review')
        else updated.delete('step')
        return updated
      },
      { replace: false },
    )
  }

  // Move focus to the new step's heading, so keyboard and screen-reader users land on it.
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    headingRef.current?.focus()
  }, [step])

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
    onError: (error) => {
      if (Object.keys(addressErrors(error)).length) goTo('delivery') // fix the address where it was typed
    },
  })

  const source = buildId === null ? cart : build
  if (source.isPending || addresses.isPending) {
    return (
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]" aria-busy="true">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 w-full" />
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    )
  }
  if (source.isError) return <ErrorMessage error={source.error} onRetry={() => void source.refetch()} />
  if (addresses.isError)
    return <ErrorMessage error={addresses.error} onRetry={() => void addresses.refetch()} />

  const error = submit.error instanceof ApiError ? submit.error : null
  const short = new Map(
    error?.code === 'insufficient_stock' && Array.isArray(error.details)
      ? (error.details as unknown[]).filter(isShortLine).map((s) => [s.product_id, s])
      : [],
  )
  const raw =
    buildId === null
      ? (cart.data?.items ?? []).map((line) => ({
          key: line.id,
          product: line.product,
          quantity: line.quantity,
          lineTotal: line.line_total,
        }))
      : (build.data?.items ?? []).map((item) => ({
          key: item.id,
          product: item.product,
          quantity: item.quantity,
          lineTotal: item.line_total,
        }))
  const lines: SummaryLine[] = raw.map((line) => {
    const shortLine = short.get(line.product.id)
    return {
      key: line.key,
      name: line.product.name,
      kind: line.product.kind,
      image: line.product.image,
      quantity: line.quantity,
      lineTotal: line.lineTotal,
      note: shortLine ? (
        <p className="text-danger-ink">
          Only {shortLine.available} available, you asked for {shortLine.requested}.
        </p>
      ) : undefined,
    }
  })

  if (!lines.length) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Checkout</h1>
        <EmptyState
          icon={ShoppingCart}
          title="Nothing to check out"
          action={
            <Button asChild>
              <Link to="/shop">Browse the catalog</Link>
            </Button>
          }
        >
          <p>Your cart is empty.</p>
        </EmptyState>
      </div>
    )
  }

  const notValidated = buildId !== null && build.data?.status !== 'validated'
  const fieldErrors = selected === NEW ? { ...addressErrors(submit.error), ...localErrors } : {}
  const goods = lines.reduce((sum, line) => sum + line.lineTotal.amount_cents, 0)
  const freeOver = config.data?.shipping.free_threshold_cents
  const shipping = config.data
    ? goods >= config.data.shipping.free_threshold_cents
      ? 0
      : config.data.shipping.flat_cents
    : null
  const holdMinutes = config.data ? Math.round(config.data.reservation_ttl_seconds / 60) : null
  const chosen = saved.find((a) => String(a.id) === selected)
  const shipTo = chosen ?? (selected === NEW ? toAddressIn(address) : null)
  const totals =
    buildId === null && cart.data ? (
      <TotalsTable totals={cart.data.totals} />
    ) : (
      <>
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-muted">Parts</dt>
            <dd className="tabular">{formatCents(goods)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-muted">Delivery</dt>
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
    )
  const total =
    buildId === null && cart.data
      ? cart.data.totals.total
      : shipping === null
        ? null
        : { amount_cents: goods + shipping, currency: lines[0]?.lineTotal.currency ?? 'nad' }

  const continueToReview = (event: SyntheticEvent) => {
    event.preventDefault()
    if (selected === NEW) {
      const problems = validateAddress(address)
      setLocalErrors(problems)
      if (Object.keys(problems).length) {
        const first = REQUIRED.find((key) => key in problems)
        if (first) document.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus()
        return
      }
    }
    submit.reset()
    goTo('review')
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Checkout</h1>
        <p className="mt-1 text-base text-ink-muted">
          {buildId === null ? 'Your cart' : `Build: ${build.data?.name ?? ''}`}
        </p>
        <Stepper
          className="mt-5"
          label="Checkout progress"
          steps={CHECKOUT_STEPS}
          current={step}
          onSelect={(id) => {
            if (id === 'delivery') goTo('delivery')
          }}
        />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="order-2 lg:order-1">
          {notValidated ? (
            <Alert tone="warning" title="This build is not validated" className="mb-6">
              Only a validated build can be checked out.{' '}
              <Link to="/configurator" className="font-medium text-accent hover:underline">
                Back to the configurator
              </Link>
            </Alert>
          ) : null}

          {step === 'delivery' ? (
            <form
              onSubmit={continueToReview}
              noValidate
              aria-labelledby="step-heading"
              className="flex flex-col gap-5"
            >
              <h2
                id="step-heading"
                ref={headingRef}
                tabIndex={-1}
                className="text-xl font-semibold text-ink focus:outline-none"
              >
                Where should we deliver?
              </h2>
              <fieldset>
                <legend className="sr-only">Delivery address</legend>
                <div className="flex flex-col gap-2">
                  {saved.map((a) => (
                    <AddressOption
                      key={a.id}
                      value={String(a.id)}
                      checked={selected === String(a.id)}
                      onSelect={setChoice}
                      title={a.recipient_name}
                      detail={formatAddress(a)}
                      badge={a.is_default ? 'Default' : undefined}
                    />
                  ))}
                  <AddressOption
                    value={NEW}
                    checked={selected === NEW}
                    onSelect={setChoice}
                    title={saved.length ? 'Use a new address' : 'New address'}
                  />
                </div>
              </fieldset>
              {selected === NEW ? (
                <div className="flex flex-col gap-4 rounded-md border border-border bg-surface p-5">
                  <AddressForm
                    values={address}
                    onChange={(values) => {
                      setAddress(values)
                      if (Object.keys(localErrors).length) setLocalErrors(validateAddress(values))
                    }}
                    errors={fieldErrors}
                  />
                  <Checkbox
                    label="Save this address for next time"
                    checked={saveAddress}
                    onChange={(event) => {
                      setSaveAddress(event.target.checked)
                    }}
                  />
                </div>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Link
                  to={buildId === null ? '/cart' : '/configurator'}
                  className="text-sm font-medium text-accent hover:underline"
                >
                  {buildId === null ? 'Back to cart' : 'Back to the configurator'}
                </Link>
                <Button type="submit" size="lg" disabled={notValidated}>
                  Continue to review
                </Button>
              </div>
            </form>
          ) : (
            <section aria-labelledby="step-heading" className="flex flex-col gap-5">
              <h2
                id="step-heading"
                ref={headingRef}
                tabIndex={-1}
                className="text-xl font-semibold text-ink focus:outline-none"
              >
                Review and reserve
              </h2>
              <div className="divide-y divide-border rounded-md border border-border bg-surface">
                <div className="flex items-start gap-3 p-4">
                  <MapPin aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-ink-subtle" />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium text-ink">Deliver to {shipTo?.recipient_name}</p>
                    <p className="text-ink-muted">{shipTo ? formatAddress(shipTo) : ''}</p>
                  </div>
                  <Button
                    variant="link"
                    size="sm"
                    aria-label="Change delivery address"
                    onClick={() => {
                      goTo('delivery')
                    }}
                  >
                    Change
                  </Button>
                </div>
                <div className="flex items-start gap-3 p-4">
                  <Truck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-ink-subtle" />
                  <div className="text-sm">
                    <p className="font-medium text-ink">
                      Courier from Windhoek,{' '}
                      {shipping === null ? '' : shipping === 0 ? 'free' : formatCents(shipping)}
                    </p>
                    <p className="text-ink-muted">
                      {shipping === 0 || freeOver === undefined
                        ? 'Dispatched once your payment is confirmed.'
                        : `Free on orders over ${formatCents(freeOver)}. Dispatched once your payment is confirmed.`}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4">
                  <Clock aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-ink-subtle" />
                  <p className="text-sm text-ink-muted">
                    Placing the order reserves every part for{' '}
                    <span className="font-medium text-ink">
                      {holdMinutes === null ? 'a while' : `${String(holdMinutes)} minutes`}
                    </span>{' '}
                    while you pay. Nothing is charged until you confirm the payment.
                  </p>
                </div>
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
              ) : submit.error ? (
                <ErrorMessage error={submit.error} />
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button
                  variant="secondary"
                  onClick={() => {
                    goTo('delivery')
                  }}
                >
                  Back
                </Button>
                <Button
                  size="lg"
                  busy={submit.isPending}
                  disabled={notValidated}
                  onClick={() => {
                    submit.mutate()
                  }}
                >
                  {submit.isPending ? 'Reserving your parts' : 'Place order and pay'}
                </Button>
              </div>
            </section>
          )}
        </div>

        <div className="order-1 lg:order-2">
          <OrderSummary lines={lines} total={total} totals={totals} />
        </div>
      </div>
    </div>
  )
}

function AddressOption({
  value,
  checked,
  onSelect,
  title,
  detail,
  badge,
}: {
  value: string
  checked: boolean
  onSelect: (value: string) => void
  title: string
  detail?: string
  badge?: string | undefined
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-md border bg-surface p-4',
        'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent',
        checked ? 'border-accent ring-1 ring-accent' : 'border-border hover:border-ink-subtle',
      )}
    >
      <input
        type="radio"
        name="address"
        value={value}
        checked={checked}
        onChange={() => {
          onSelect(value)
        }}
        className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
      />
      <span className="min-w-0 flex-1 text-sm">
        <span className="flex items-center gap-2 font-medium text-ink">
          {title}
          {badge ? (
            <span className="rounded-sm bg-surface-muted px-1.5 py-0.5 text-xs font-normal text-ink-muted">
              {badge}
            </span>
          ) : null}
        </span>
        {detail ? <span className="block text-ink-muted">{detail}</span> : null}
      </span>
    </label>
  )
}
