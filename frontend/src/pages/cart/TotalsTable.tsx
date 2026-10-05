import { useQuery } from '@tanstack/react-query'
import type { components } from '@/api/schema'
import { configQuery } from '@/app/config'
import { formatPrice } from '@/lib/money'

type Totals = components['schemas']['Totals']

/** Order or cart totals. Prices are VAT-inclusive, so VAT is shown as the share of the total. */
export function TotalsTable({ totals }: { totals: Totals }) {
  const config = useQuery(configQuery)
  const shippingFree = totals.shipping.amount_cents === 0
  const rate = config.data ? ` (${String(config.data.vat_rate_bps / 100)}%)` : ''
  return (
    <dl className="space-y-2 text-sm">
      <div className="flex justify-between">
        <dt className="text-ink-muted">Subtotal (excluding VAT)</dt>
        <dd className="tabular">{formatPrice(totals.subtotal)}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-ink-muted">Shipping (excluding VAT)</dt>
        <dd className="tabular">{shippingFree ? 'Free' : formatPrice(totals.shipping)}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-ink-muted">VAT{rate}</dt>
        <dd className="tabular">{formatPrice(totals.tax)}</dd>
      </div>
      <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
        <dt>Total</dt>
        <dd className="tabular">{formatPrice(totals.total)}</dd>
      </div>
    </dl>
  )
}
