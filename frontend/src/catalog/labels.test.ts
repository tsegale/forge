import { describe, expect, it } from 'vitest'
import { inSentence } from './labels'

describe('inSentence', () => {
  it.each([
    ['Memory kit', 'memory kit'],
    ['CPU', 'CPU'],
    ['CPU cooler', 'CPU cooler'],
    ['Accessory', 'accessory'],
  ])('%s -> %s', (label, expected) => {
    expect(inSentence(label)).toBe(expected)
  })
})
