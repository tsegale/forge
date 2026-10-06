import { CreditCard, Minus, Plus, ShieldCheck, ShoppingCart } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import type { components } from '@/api/schema'
import { useAuth } from '@/auth/context'
import {
  addToCart,
  removeCartLine,
  setCartQuantity,
  setSavedForLater,
  useCart,
  useCartMutation,
} from '@/cart/api'
import { keySpecs } from '@/catalog/specs'
import { ProductImage } from '@/components/catalog/ProductImage'
import { FreeShippingProgress } from '@/components/layout/MiniCart'
import { Alert } from '@/components/ui/Alert'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { Button, IconButton } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { Skeleton } from '@/components/ui/Skeleton'
import { StockIndicator } from '@/components/ui/StockIndicator'
import { toast } from '@/components/ui/toastStore'
import { formatPrice } from '@/lib/money'
import { usePageTitle } from '@/lib/usePageTitle'
import { TotalsTable } from './TotalsTable'

type Line = components['schemas']['CartLine']

const MAX_LINE_QUANTITY = 99

/**
 * Shown when an order's parts are put back in the cart ("start a fresh checkout" or "buy again")
 * and some of them are no longer sold.
 */
export interface CartNotice {
  unavailable: number
}

function LineRow({
  line,
  saved,
  busy,
  onQuantity,
  onSave,
  onRemove,
}: {
  line: Line
  saved: boolean
  busy: boolean
  onQuantity: (quantity: number) => void
  onSave: (saved: boolean) => void
  onRemove: () => void
}) {
  const { product } = line
  return (
    <li className="grid grid-cols-[5rem_1fr] gap-x-4 gap-y-3 p-4 sm:grid-cols-[6rem_1fr_auto]">
      <ProductImage
        image={product.image}
        kind={product.kind}
        name={product.name}
        variant="thumb"
        className="rounded-sm border border-border"
      />
      <div className="min-w-0">
        <p className="text-xs text-ink-subtle">{product.brand.name}</p>
        <Link
          to={`/products/${product.slug}`}
          className="text-base leading-snug font-medium text-ink hover:text-accent"
        >
          {product.name}
        </Link>
        <p className="mt-0.5 truncate font-tech text-xs text-ink-muted">
          {keySpecs(product.specs).join(' / ')}
        </p>
        <div className="mt-1.5">
          {line.in_stock || saved ? (
            <StockIndicator availability={product.availability} />
          ) : (
            <p className="text-sm text-danger-ink">
              Only {product.availability.quantity_available} available. Lower the quantity to check out.
            </p>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <button
            type="button"
            disabled={busy}
            className="font-medium text-accent hover:underline disabled:opacity-50"
            aria-label={`${saved ? 'Move to cart' : 'Save for later'}: ${product.name}`}
            onClick={() => {
              onSave(!saved)
            }}
          >
            {saved ? 'Move to cart' : 'Save for later'}
          </button>
          <button
            type="button"
            disabled={busy}
            className="font-medium text-ink-muted hover:text-danger-ink hover:underline disabled:opacity-50"
            aria-label={`Remove ${product.name}`}
            onClick={onRemove}
          >
            Remove
          </button>
        </div>
      </div>
      <div className="col-span-2 flex items-center justify-between gap-4 sm:col-span-1 sm:flex-col sm:items-end sm:justify-start">
        <div className="sm:text-right">
          <p className="text-base font-semibold text-ink tabular">{formatPrice(line.line_total)}</p>
          {line.quantity > 1 ? (
            <p className="text-xs text-ink-subtle tabular">{formatPrice(product.price)} each</p>
          ) : null}
        </div>
        {saved ? (
          <p className="text-sm text-ink-muted tabular">Quantity {line.quantity}</p>
        ) : (
          <div
            className="flex items-center rounded-sm border border-control"
            role="group"
            aria-label={`Quantity of ${product.name}`}
          >
            <IconButton
              label="Decrease quantity"
              size="sm"
              disabled={line.quantity <= 1 || busy}
              onClick={() => {
                onQuantity(line.quantity - 1)
              }}
            >
              <Minus aria-hidden="true" className="h-3.5 w-3.5" />
            </IconButton>
            <span className="w-8 text-center text-sm tabular" aria-live="polite">
              {line.quantity}
            </span>
            <IconButton
              label="Increase quantity"
              size="sm"
              disabled={line.quantity >= MAX_LINE_QUANTITY || busy}
              onClick={() => {
                onQuantity(line.quantity + 1)
              }}
            >
              <Plus aria-hidden="true" className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        )}
      </div>
    </li>
  )
}

/** The cart: lines with quantities, lines saved for later, and the VAT-inclusive summary. */
export function CartPage() {
  usePageTitle('Cart')
  const cart = useCart()
  const { status } = useAuth()
  const notice = (useLocation().state as { cartNotice?: CartNotice } | null)?.cartNotice
  const quantity = useCartMutation(({ id, qty }: { id: number; qty: number }) => setCartQuantity(id, qty))
  const save = useCartMutation(({ id, saved }: { id: number; saved: boolean }) => setSavedForLater(id, saved))
  const remove = useCartMutation(removeCartLine)
  const restore = useCartMutation(({ productId, qty }: { productId: number; qty: number }) =>
    addToCart(productId, qty),
  )
  const busy = quantity.isPending || save.isPending || remove.isPending

  if (cart.isError) return <ErrorMessage error={cart.error} onRetry={() => void cart.refetch()} />
  if (!cart.data) {
    return (
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]" aria-busy="true">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  const { items, saved, totals, item_count } = cart.data

  const removeLine = (line: Line) => {
    remove.mutate(line.id, {
      onSuccess: () => {
        toast({
          tone: 'info',
          title: 'Removed from your cart',
          description: line.product.name,
          action: {
            label: 'Undo',
            onClick: () => {
              restore.mutate({ productId: line.product.id, qty: line.quantity })
            },
          },
        })
      },
    })
  }
  const row = (line: Line, isSaved: boolean) => (
    <LineRow
      key={line.id}
      line={line}
      saved={isSaved}
      busy={busy}
      onQuantity={(qty) => {
        quantity.mutate({ id: line.id, qty })
      }}
      onSave={(value) => {
        save.mutate({ id: line.id, saved: value })
      }}
      onRemove={() => {
        removeLine(line)
      }}
    />
  )

  const goods = items.reduce((sum, line) => sum + line.line_total.amount_cents, 0)
  const blocked = items.some((line) => !line.in_stock)
  const checkoutTarget = '/checkout'
  const savedSection = saved.length ? (
    <section aria-labelledby="saved-heading" className="mt-8">
      <h2 id="saved-heading" className="text-lg font-semibold text-ink">
        Saved for later <span className="font-normal text-ink-subtle">({saved.length})</span>
      </h2>
      <p className="mt-1 text-sm text-ink-muted">Kept here, but not part of your order or its total.</p>
      <ul className="mt-3 divide-y divide-border rounded-md border border-border bg-surface">
        {saved.map((line) => row(line, true))}
      </ul>
    </section>
  ) : null

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Cart' }]} />
        <h1 id="cart-heading" className="mt-3 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Your cart{' '}
          {item_count ? (
            <span className="font-normal text-ink-subtle">
              ({item_count} {item_count === 1 ? 'item' : 'items'})
            </span>
          ) : null}
        </h1>
      </div>

      {notice?.unavailable ? (
        <Alert tone="warning" title="Some parts could not be added back">
          {notice.unavailable === 1
            ? 'One part from your previous order is no longer sold.'
            : `${String(notice.unavailable)} parts from your previous order are no longer sold.`}
        </Alert>
      ) : null}
      <ErrorMessage error={quantity.error ?? save.error ?? remove.error ?? restore.error} />

      {!items.length ? (
        <div>
          <EmptyState
            icon={ShoppingCart}
            title="Your cart is empty"
            action={
              <>
                <Button asChild>
                  <Link to="/shop">Browse the catalog</Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link to="/configurator">Build a PC</Link>
                </Button>
              </>
            }
          >
            <p>Browse the catalog or configure a build to get started.</p>
          </EmptyState>
          {savedSection}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section aria-labelledby="cart-heading">
            <ul
              className="divide-y divide-border rounded-md border border-border bg-surface"
              aria-label="Cart lines"
            >
              {items.map((line) => row(line, false))}
            </ul>
            {savedSection}
          </section>

          <aside
            aria-label="Order summary"
            className="flex h-fit flex-col gap-5 rounded-md border border-border bg-surface p-5 lg:sticky lg:top-28"
          >
            <h2 className="text-base font-semibold text-ink">Summary</h2>
            <FreeShippingProgress goodsCents={goods} />
            <TotalsTable totals={totals} />
            {blocked ? (
              <Button size="lg" className="w-full" disabled>
                Check out
              </Button>
            ) : (
              <Button asChild size="lg" className="w-full">
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
            <ul className="flex flex-col gap-2 border-t border-border pt-4 text-sm text-ink-muted">
              <li className="flex gap-2">
                <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-ink-subtle" />
                Stock is held for you once you check out, not while items sit in the cart.
              </li>
              <li className="flex gap-2">
                <CreditCard aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-ink-subtle" />
                Card payments by Stripe. Card details never reach Forge.
              </li>
            </ul>
          </aside>
        </div>
      )}
    </div>
  )
}
