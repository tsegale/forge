import { describe, expect, it } from 'vitest'
import { colorTokens, contrast } from '@/lib/contrast'
import tokens from './tokens.css?raw'

/**
 * WCAG 2.1 contrast for every colour pairing the components use, read from tokens.css itself,
 * so changing a token cannot quietly break accessibility. Text needs 4.5:1 (AA, normal size);
 * control boundaries and focus indicators need 3:1 (1.4.11 non-text contrast).
 */

const COLORS = colorTokens(tokens)

function color(name: string): string {
  const hex = COLORS[name]
  if (!hex) throw new Error(`No --color-${name} in tokens.css`)
  return hex
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
