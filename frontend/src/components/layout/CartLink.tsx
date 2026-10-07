import { ShoppingCart } from 'lucide-react'
import { useCart } from '@/cart/api'
import { setMiniCartOpen } from '@/cart/miniCart'

/** Header cart button with the item count; opens the mini-cart drawer. */
export function CartLink() {
  const cart = useCart()
  const count = cart.data?.item_count ?? 0
  return (
    <button
      type="button"
      onClick={() => {
        setMiniCartOpen(true)
      }}
      aria-label={count ? `Cart, ${String(count)} ${count === 1 ? 'item' : 'items'}` : 'Cart, empty'}
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-md text-ink-muted hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
    >
      <ShoppingCart aria-hidden="true" className="h-5 w-5" />
      {count ? (
        <span
          aria-hidden="true"
          className="absolute top-1 right-0.5 min-w-4.5 rounded-full bg-accent px-1 text-center text-[0.6875rem] leading-4.5 font-semibold text-white tabular"
        >
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </button>
  )
}
