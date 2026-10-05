/**
 * The build being configured. It lives in the browser so a guest can configure without an
 * account; once saved, `buildId` links it to a server build, which stays the source of truth for
 * validation and checkout.
 */
import type { components } from '@/api/schema'

export type ProductSummary = components['schemas']['ProductSummary']

export interface DraftItem {
  product: ProductSummary
  quantity: number
}

export interface Draft {
  name: string
  /** The saved build this draft edits, and the account it belongs to; both null for a guest. */
  buildId: number | null
  ownerId: number | null
  items: DraftItem[]
}

export const DEFAULT_NAME = 'My build'
export const emptyDraft = (): Draft => ({
  name: DEFAULT_NAME,
  buildId: null,
  ownerId: null,
  items: [],
})

export function kindCount(draft: Draft, kind: string): number {
  return draft.items.reduce((sum, item) => (item.product.kind === kind ? sum + item.quantity : sum), 0)
}

/**
 * Add a part. For a single-slot kind (`max === 1`) the part replaces the current one; otherwise
 * it is added, or its quantity raised, up to the kind's limit. Returns the draft unchanged when
 * the kind is full.
 */
export function addPart(draft: Draft, product: ProductSummary, max: number): Draft {
  if (max <= 1) {
    const others = draft.items.filter((item) => item.product.kind !== product.kind)
    return { ...draft, items: [...others, { product, quantity: 1 }] }
  }
  if (kindCount(draft, product.kind) >= max) return draft
  const existing = draft.items.find((item) => item.product.id === product.id)
  const items = existing
    ? draft.items.map((item) => (item === existing ? { product, quantity: item.quantity + 1 } : item))
    : [...draft.items, { product, quantity: 1 }]
  return { ...draft, items }
}

/** Set a part's quantity, clamped so the kind stays within `max`. Zero removes it. */
export function setQuantity(draft: Draft, productId: number, quantity: number, max: number): Draft {
  const target = draft.items.find((item) => item.product.id === productId)
  if (!target) return draft
  if (quantity <= 0) return removePart(draft, productId)
  const room = max - (kindCount(draft, target.product.kind) - target.quantity)
  const next = Math.min(quantity, room)
  return {
    ...draft,
    items: draft.items.map((item) => (item === target ? { ...item, quantity: next } : item)),
  }
}

export function removePart(draft: Draft, productId: number): Draft {
  return { ...draft, items: draft.items.filter((item) => item.product.id !== productId) }
}

export function subtotalCents(draft: Draft): number {
  return draft.items.reduce((sum, item) => sum + item.product.price.amount_cents * item.quantity, 0)
}

/** A stable key for the parts list, so queries refetch only when the parts actually change. */
export function partsKey(items: readonly DraftItem[]): [number, number][] {
  return items.map((item): [number, number] => [item.product.id, item.quantity]).sort((a, b) => a[0] - b[0])
}

/** Load a server build, owned by `ownerId`, into a draft. */
export function fromBuild(build: components['schemas']['BuildDetail'], ownerId: number): Draft {
  return {
    name: build.name,
    buildId: build.id,
    ownerId,
    items: build.items.map((item) => ({ product: item.product, quantity: item.quantity })),
  }
}
