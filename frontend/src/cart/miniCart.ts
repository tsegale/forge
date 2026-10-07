import { useSyncExternalStore } from 'react'

/** Whether the mini-cart drawer is open. Module state, so "Add to cart" anywhere can open it. */
let open = false
const listeners = new Set<() => void>()

export function setMiniCartOpen(next: boolean): void {
  open = next
  for (const listener of listeners) listener()
}

export function useMiniCartOpen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => open,
    () => open,
  )
}
