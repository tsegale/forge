import { describe, expect, it } from 'vitest'
import { buildPhoto, CATEGORY_PHOTOS, PHOTOS, type PhotoSource } from './photos'

const all: [string, PhotoSource][] = [
  ...Object.entries(PHOTOS),
  ...Object.entries(CATEGORY_PHOTOS).filter(
    (entry): entry is [string, PhotoSource] => entry[1] !== undefined,
  ),
  ['gaming', buildPhoto('1440p gaming', 0)],
  ['compact', buildPhoto('Compact small form factor', 1)],
  ['creator', buildPhoto('Creator workstation', 2)],
]

describe('photos', () => {
  it.each(all)('%s has responsive variants, a fixed ratio and a real description', (_, photo) => {
    const widths = photo.srcSet.split(', ').map((entry) => Number(/ (\d+)w$/.exec(entry)?.[1]))
    expect(widths.length).toBeGreaterThanOrEqual(2)
    expect(widths).toEqual([...widths].sort((a, b) => a - b))
    expect(photo.width).toBe(widths.at(-1))
    const [w, h] = photo.aspect.split(' / ').map(Number)
    expect(photo.height).toBe(Math.round((photo.width * (h ?? 0)) / (w ?? 1)))
    expect(photo.alt.length).toBeGreaterThan(20)
  })

  it('covers every category tile except accessories', () => {
    expect(Object.keys(CATEGORY_PHOTOS).sort()).toEqual(
      ['case', 'cooler', 'cpu', 'gpu', 'memory', 'motherboard', 'psu', 'storage'].sort(),
    )
  })

  it('matches featured builds by name and falls back by position', () => {
    expect(buildPhoto('Compact small form factor', 0)).toBe(buildPhoto('Mini ITX build', 2))
    expect(buildPhoto('Creator workstation', 0)).not.toBe(buildPhoto('1440p gaming', 0))
    expect(buildPhoto('Something else', 1)).toBe(buildPhoto('Compact small form factor', 0))
  })
})
