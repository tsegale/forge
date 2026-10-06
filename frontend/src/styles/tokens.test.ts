import { describe, expect, it } from 'vitest'
import tokens from './tokens.css?raw'

/**
 * WCAG 2.1 contrast for every colour pairing the components use, read from tokens.css itself,
 * so changing a token cannot quietly break accessibility. Text needs 4.5:1 (AA, normal size);
 * control boundaries and focus indicators need 3:1 (1.4.11 non-text contrast).
 */

function color(name: string): string {
  const match = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(tokens)
  if (!match?.[1]) throw new Error(`No --color-${name} in tokens.css`)
  return match[1]
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r = 0, g = 0, b = 0] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (light + 0.05) / (dark + 0.05)
}

const BACKGROUNDS = ['surface', 'canvas', 'surface-muted']
const TINTS = ['accent-soft', 'success-soft', 'warning-soft', 'danger-soft']

const TEXT: [string, string[]][] = [
  ['ink', [...BACKGROUNDS, ...TINTS]],
  ['ink-muted', [...BACKGROUNDS, ...TINTS]],
  ['ink-subtle', [...BACKGROUNDS, ...TINTS]],
  ['accent', [...BACKGROUNDS, 'accent-soft']],
  ['accent-hover', [...BACKGROUNDS, 'accent-soft']],
  ['success-ink', ['surface', 'canvas', 'success-soft']],
  ['warning-ink', ['surface', 'canvas', 'warning-soft']],
  ['danger-ink', ['surface', 'canvas', 'danger-soft']],
]

// White text on solid fills (buttons, the cart count badge).
const ON_FILL = ['accent', 'accent-hover', 'accent-active', 'danger', 'danger-hover', 'success-ink']

const NON_TEXT: [string, string[]][] = [
  ['control', BACKGROUNDS],
  ['accent', BACKGROUNDS], // focus ring, checked controls
  ['danger', ['surface', 'canvas']], // invalid input border
]

describe('design tokens meet WCAG 2.1 AA', () => {
  it.each(TEXT.flatMap(([fg, bgs]) => bgs.map((bg) => [fg, bg] as const)))(
    'text %s on %s is at least 4.5:1',
    (fg, bg) => {
      expect(contrast(color(fg), color(bg))).toBeGreaterThanOrEqual(4.5)
    },
  )

  it.each(ON_FILL)('white text on %s is at least 4.5:1', (fill) => {
    expect(contrast('#ffffff', color(fill))).toBeGreaterThanOrEqual(4.5)
  })

  it.each(NON_TEXT.flatMap(([fg, bgs]) => bgs.map((bg) => [fg, bg] as const)))(
    'control colour %s on %s is at least 3:1',
    (fg, bg) => {
      expect(contrast(color(fg), color(bg))).toBeGreaterThanOrEqual(3)
    },
  )

  it('uses the approved Forge blue', () => {
    expect(color('accent').toLowerCase()).toBe('#1e4fa8')
    expect(contrast('#ffffff', color('accent'))).toBeCloseTo(7.67, 1)
  })
})
