import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { useSetCart } from '@/cart/api'
import { reorder } from './api'

/** Put an order's parts back in the cart and open it, saying if any are no longer sold. */
export function useBuyAgain() {
  const navigate = useNavigate()
  const setCart = useSetCart()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: reorder,
    onSuccess: (cart) => {
      setCart(cart)
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
      void navigate('/cart', {
        state: { cartNotice: { unavailable: cart.unavailable_product_ids.length } },
      })
    },
  })
}
