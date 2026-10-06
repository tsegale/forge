import { useSyncExternalStore, type ReactNode } from 'react'

/**
 * Transient confirmations ("Added to cart") that do not need a decision. Announced politely, they
 * pause while hovered or focused; errors that need action belong in an inline Alert instead.
 */

export type ToastTone = 'success' | 'info' | 'danger'

export interface ToastItem {
  id: number
  tone: ToastTone
  title: string
  description?: ReactNode
  action?: { label: string; onClick: () => void }
}

let items: ToastItem[] = []
let nextId = 1
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function dismissToast(id: number) {
  items = items.filter((item) => item.id !== id)
  emit()
}

/** Show a toast; returns its id. Safe to call from anywhere (mutation callbacks included). */
export function toast(item: Omit<ToastItem, 'id' | 'tone'> & { tone?: ToastTone }): number {
  const id = nextId++
  items = [...items.slice(-2), { tone: 'success', ...item, id }] // at most three on screen
  emit()
  return id
}

export function useToasts(): ToastItem[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => items,
    () => items,
  )
}
