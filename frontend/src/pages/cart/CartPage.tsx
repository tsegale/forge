import { useQuery } from '@tanstack/react-query'
import { Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { configQuery } from '@/app/config'
import { useAuth } from '@/auth/context'
import { removeCartLine, setCartQuantity, useCart, useCartMutation } from '@/cart/api'
import { KindIcon } from '@/catalog/kinds'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { formatCents, formatPrice } from '@/lib/money'
import { TotalsTable } from './TotalsTable'

const MAX_LINE_QUANTITY = 99

/** Shown after "start a fresh checkout" when some of the old order's parts are no longer sold. */
export interface CartNotice {
  unavailable: number
}

export function CartPage() {
  const cart = useCart()
  const config = useQuery(configQuery)
  const { status } = useAuth()
  const notice = (useLocation().state as { cartNotice?: CartNotice } | null)?.cartNotice
  const quantity = useCartMutation(({ id, qty }: { id: number; qty: number }) => setCartQuantity(id, qty))
  const remove = useCartMutation(removeCartLine)

  if (cart.isPending) return <p className="text-sm text-ink-muted">Loading</p>
  if (cart.isError) return <ErrorMessage error={cart.error} />
  const { items, totals } = cart.data

  if (!items.length) {
    return (
      <section className="py-16 text-center">
        <ShoppingCart aria-hidden="true" className="mx-auto h-10 w-10 text-ink-subtle" />
        <h1 className="mt-4 text-2xl font-semibold">Your cart is empty</h1>
        <p className="mt-2 text-ink-muted">Browse the catalog or configure a build to get started.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Button asChild>
            <Link to="/">Browse the catalog</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/configurator">Build a PC</Link>
          </Button>
        </div>
      </section>
    )
  }

  const goods = items.reduce((sum, line) => sum + line.line_total.amount_cents, 0)
  const threshold = config.data?.shipping.free_threshold_cents
  const toFreeShipping = threshold !== undefined && goods < threshold ? threshold - goods : 0
  const blocked = items.some((line) => !line.in_stock)
  const checkoutTarget = '/checkout'

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_22rem]">
      <section aria-labelledby="cart-heading">
        <h1 id="cart-heading" className="text-2xl font-semibold">
          Cart
        </h1>
        {notice?.unavailable ? (
          <div className="mt-4">
            <Alert tone="warning" title="Some parts could not be added back">
              {notice.unavailable === 1
                ? 'One part from your previous order is no longer sold.'
                : `${String(notice.unavailable)} parts from your previous order are no longer sold.`}
            </Alert>
          </div>
        ) : null}
        <ul className="mt-6 divide-y divide-border rounded-[var(--radius-card)] border border-border bg-surface">
          {items.map((line) => (
            <li key={line.id} className="flex flex-wrap items-center gap-4 p-4">
              <span className="rounded-md bg-accent-soft p-2 text-accent">
                <KindIcon kind={line.product.kind} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-ink-subtle">{line.product.brand.name}</p>
                <Link to={`/products/${line.product.slug}`} className="text-sm font-medium hover:text-accent">
                  {line.product.name}
                </Link>
                <p className="text-xs text-ink-muted tabular">{formatPrice(line.product.price)} each</p>
                {line.in_stock ? null : (
                  <p className="text-xs text-danger">
                    Only {line.product.availability.quantity_available} available. Lower the quantity to check
                    out.
                  </p>
                )}
              </div>
              <div
                className="flex items-center gap-1"
                role="group"
                aria-label={`Quantity of ${line.product.name}`}
              >
                <Button
                  variant="ghost"
                  className="px-2"
                  aria-label="Decrease quantity"
                  disabled={line.quantity <= 1 || quantity.isPending}
                  onClick={() => {
                    quantity.mutate({ id: line.id, qty: line.quantity - 1 })
                  }}
                >
                  <Minus aria-hidden="true" className="h-4 w-4" />
                </Button>
                <span className="w-8 text-center text-sm tabular" aria-live="polite">
                  {line.quantity}
                </span>
                <Button
                  variant="ghost"
                  className="px-2"
                  aria-label="Increase quantity"
                  disabled={line.quantity >= MAX_LINE_QUANTITY || quantity.isPending}
                  onClick={() => {
                    quantity.mutate({ id: line.id, qty: line.quantity + 1 })
                  }}
                >
                  <Plus aria-hidden="true" className="h-4 w-4" />
                </Button>
              </div>
              <span className="w-28 text-right text-sm font-medium tabular">
                {formatPrice(line.line_total)}
              </span>
              <Button
                variant="ghost"
                className="px-2"
                aria-label={`Remove ${line.product.name}`}
                disabled={remove.isPending}
                onClick={() => {
                  remove.mutate(line.id)
                }}
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
        <div className="mt-4">
          <ErrorMessage error={quantity.error ?? remove.error} />
        </div>
      </section>

      <aside
        aria-label="Order summary"
        className="h-fit space-y-4 rounded-[var(--radius-card)] border border-border bg-surface p-5"
      >
        <h2 className="text-sm font-semibold">Summary</h2>
        <TotalsTable totals={totals} />
        {toFreeShipping > 0 ? (
          <p className="text-xs text-ink-muted">Add {formatCents(toFreeShipping)} more for free shipping.</p>
        ) : null}
        {blocked ? (
          <Button className="w-full" disabled>
            Check out
          </Button>
        ) : (
          <Button asChild className="w-full">
            <Link
              to={
                status === 'authenticated'
                  ? checkoutTarget
                  : `/login?next=${encodeURIComponent(checkoutTarget)}`
              }
            >
              {status === 'authenticated' ? 'Check out' : 'Sign in to check out'}
            </Link>
          </Button>
        )}
        <p className="text-xs text-ink-subtle">
          Stock is held for you once you check out, not while items sit in the cart.
        </p>
      </aside>
    </div>
  )
}
