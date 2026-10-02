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
