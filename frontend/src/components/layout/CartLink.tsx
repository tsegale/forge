import { ShoppingCart } from 'lucide-react'
import { NavLink } from 'react-router'
import { useCart } from '@/cart/api'

export function CartLink() {
  const cart = useCart()
  const count = cart.data?.item_count ?? 0
  return (
    <NavLink
      to="/cart"
      aria-label={count ? `Cart, ${String(count)} items` : 'Cart'}
      className={({ isActive }) =>
        `relative rounded-md p-2 ${isActive ? 'bg-accent-soft text-accent' : 'text-ink-muted hover:bg-canvas hover:text-ink'}`
      }
    >
      <ShoppingCart aria-hidden="true" className="h-5 w-5" />
      {count ? (
        <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-accent px-1 text-center text-[0.625rem] leading-4 font-semibold text-white tabular">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </NavLink>
  )
}
