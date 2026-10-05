import { describe, expect, it } from 'vitest'
import { cpu } from '@/test/fixtures'
import { addPart, emptyDraft, kindCount, partsKey, removePart, setQuantity } from './draft'

const memory = (id: number) =>
  cpu({ id, kind: 'memory', slug: `kit-${String(id)}`, name: `Kit ${String(id)}` })

describe('draft', () => {
  it('replaces the part of a single-slot kind', () => {
    let draft = addPart(emptyDraft(), cpu(), 1)
    draft = addPart(draft, cpu({ id: 2, name: 'Other CPU' }), 1)
    expect(draft.items.map((item) => item.product.id)).toEqual([2])
  })

  it('adds parts of a multi-slot kind up to its limit', () => {
    let draft = emptyDraft()
    for (let i = 0; i < 3; i++) draft = addPart(draft, memory(10), 2)
    draft = addPart(draft, memory(11), 2)
    expect(kindCount(draft, 'memory')).toBe(2)
    expect(draft.items).toHaveLength(1)
    expect(draft.items[0]?.quantity).toBe(2)
  })

  it('clamps quantity to the room left in the kind and removes at zero', () => {
    let draft = addPart(addPart(emptyDraft(), memory(10), 4), memory(11), 4)
    draft = setQuantity(draft, 10, 9, 4)
    expect(draft.items.find((item) => item.product.id === 10)?.quantity).toBe(3)
    draft = setQuantity(draft, 11, 0, 4)
    expect(draft.items.map((item) => item.product.id)).toEqual([10])
  })

  it('keys parts by id and quantity regardless of order', () => {
    const a = addPart(addPart(emptyDraft(), memory(11), 4), cpu(), 1)
    const b = addPart(addPart(emptyDraft(), cpu(), 1), memory(11), 4)
    expect(partsKey(a.items)).toEqual(partsKey(b.items))
    expect(partsKey(removePart(a, 11).items)).toEqual([[1, 1]])
  })
})
