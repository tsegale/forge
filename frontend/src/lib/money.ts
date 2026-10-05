/**
 * Money arrives as integer minor units (cents) and is only ever formatted, never computed with
 * floats. Output matches the backend's emails: "N$ 1,234.56".
 */
export interface Price {
  amount_cents: number
  currency: string
}

function groupThousands(whole: number): string {
  return whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export function formatCents(cents: number, currency = 'nad'): string {
  if (!Number.isInteger(cents)) throw new Error(`Money must be integer cents, got ${cents}`)
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  const amount = `${groupThousands(Math.floor(abs / 100))}.${String(abs % 100).padStart(2, '0')}`
  return currency.toLowerCase() === 'nad'
    ? `${sign}N$ ${amount}`
    : `${sign}${amount} ${currency.toUpperCase()}`
}

export function formatPrice(price: Price): string {
  return formatCents(price.amount_cents, price.currency)
}

/**
 * Parse an amount typed by a person ("2299", "2,299.5", "N$ 2 299.00") into integer cents,
 * using string arithmetic only, never floats. Null if it is not a valid non-negative amount
 * with at most two decimals.
 */
export function parseCents(input: string): number | null {
  const cleaned = input.replace(/^\s*N\$\s*/i, '').replace(/[\s,]/g, '')
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned)
  if (!match) return null
  const whole = match[1] ?? '0'
  const fraction = (match[2] ?? '').padEnd(2, '0')
  const cents = Number(whole) * 100 + Number(fraction)
  return Number.isSafeInteger(cents) ? cents : null
}

/** Cents as an editable amount without currency or grouping: 229900 becomes "2299.00". */
export function centsToInput(cents: number): string {
  return `${String(Math.floor(cents / 100))}.${String(cents % 100).padStart(2, '0')}`
}
