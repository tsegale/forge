import { useQuery } from '@tanstack/react-query'
import { ShoppingCart } from 'lucide-react'
import { Link } from 'react-router'
import { configQuery } from '@/app/config'
import { useAuth } from '@/auth/context'
import { useCart } from '@/cart/api'
import { setMiniCartOpen, useMiniCartOpen } from '@/cart/miniCart'
import { ProductImage } from '@/components/catalog/ProductImage'
import { Button } from '@/components/ui/Button'
import { Drawer } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatCents, formatPrice } from '@/lib/money'

/** Free-shipping progress from the store's own rule (GET /config). */
export function FreeShippingProgress({ goodsCents }: { goodsCents: number }) {
  const config = useQuery(configQuery)
  const threshold = config.data?.shipping.free_threshold_cents
  if (threshold === undefined) return null
  const left = Math.max(threshold - goodsCents, 0)
  return (
    <div className="space-y-2">
      <p className="text-sm text-ink-muted">
        {left > 0 ? (
          <>
            Add <span className="font-medium text-ink tabular">{formatCents(left)}</span> for free delivery.
          </>
        ) : (
          <span className="font-medium text-success-ink">Free delivery on this order.</span>
        )}
      </p>
      <ProgressBar
        value={Math.min(goodsCents, threshold)}
        max={threshold}
        tone={left > 0 ? 'accent' : 'success'}
        label="Progress to free delivery"
        valueText={`${formatCents(Math.min(goodsCents, threshold))} of ${formatCents(threshold)}`}
      />
    </div>
  )
}

/** The cart at a glance, from the header. The full cart page has quantities and the VAT breakdown. */
export function MiniCart() {
  const open = useMiniCartOpen()
  const { status } = useAuth()
  const cart = useCart({ enabled: open })
  const lines = cart.data?.items ?? []
  const goods = lines.reduce((sum, line) => sum + line.line_total.amount_cents, 0)
  const close = () => {
    setMiniCartOpen(false)
  }

  return (
    <Drawer
      open={open}
      onOpenChange={setMiniCartOpen}
      title="Your cart"
      description={
        cart.data
          ? `${String(cart.data.item_count)} ${cart.data.item_count === 1 ? 'item' : 'items'}`
          : undefined
      }
      footer={
        lines.length ? (
          <div className="space-y-4">
            <FreeShippingProgress goodsCents={goods} />
            <div className="flex items-baseline justify-between">
              <span className="text-base text-ink-muted">Subtotal</span>
              <span className="text-lg font-semibold text-ink tabular">{formatCents(goods)}</span>
            </div>
            <p className="-mt-3 text-xs text-ink-subtle">VAT included. Delivery calculated at checkout.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button asChild variant="secondary" onClick={close}>
                <Link to="/cart">View cart</Link>
              </Button>
              <Button asChild onClick={close}>
                <Link
                  to={
                    status === 'authenticated'
                      ? '/checkout'
                      : `/login?next=${encodeURIComponent('/checkout')}`
                  }
                >
                  Check out
                </Link>
              </Button>
            </div>
          </div>
        ) : undefined
      }
    >
      {cart.isPending ? (
        <div className="space-y-4" aria-hidden="true">
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-14 w-18" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : cart.isError ? (
        <ErrorMessage error={cart.error} onRetry={() => void cart.refetch()} retrying={cart.isFetching} />
      ) : lines.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="Your cart is empty"
          action={
            <Button asChild onClick={close}>
              <Link to="/">Browse the catalog</Link>
            </Button>
          }
        >
          Parts you add appear here. Stock is held for you once you check out.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border">
          {lines.map((line) => (
            <li key={line.id} className="flex gap-3 py-3 first:pt-0">
              <ProductImage
                kind={line.product.kind}
                name={line.product.name}
                variant="thumb"
                className="w-18 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <Link
                  to={`/products/${line.product.slug}`}
                  onClick={close}
                  className="line-clamp-2 text-base font-medium text-ink hover:text-accent"
                >
                  {line.product.name}
                </Link>
                <p className="mt-0.5 text-sm text-ink-subtle tabular">
                  {line.quantity} x {formatPrice(line.product.price)}
                </p>
                {line.in_stock ? null : (
                  <p className="text-xs font-medium text-danger-ink">Not enough stock for this quantity</p>
                )}
              </div>
              <span className="text-base font-medium text-ink tabular">{formatPrice(line.line_total)}</span>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  )
}
