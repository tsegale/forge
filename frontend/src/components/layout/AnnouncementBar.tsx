import { useQuery } from '@tanstack/react-query'
import { ShieldCheck, Truck } from 'lucide-react'
import { configQuery } from '@/app/config'
import { formatCents } from '@/lib/money'

/** One line of store policy above the header, from the store's own settings (GET /config). */
export function AnnouncementBar() {
  const config = useQuery(configQuery)
  const threshold = config.data?.shipping.free_threshold_cents
  return (
    <div className="bg-ink text-white">
      <div className="mx-auto flex h-9 max-w-7xl items-center justify-center gap-6 px-4 text-sm sm:justify-between sm:px-6 lg:px-8">
        <p className="flex items-center gap-2">
          <Truck aria-hidden="true" className="h-4 w-4 text-white/70" />
          {threshold === undefined ? (
            'Delivery across Namibia'
          ) : (
            <span>
              Free delivery<span className="hidden sm:inline"> across Namibia</span> on orders over{' '}
              <span className="font-medium tabular">{formatCents(threshold)}</span>
            </span>
          )}
        </p>
        <p className="hidden items-center gap-2 text-white/80 sm:flex">
          <ShieldCheck aria-hidden="true" className="h-4 w-4 text-white/70" />
          Every build checked for compatibility. Prices include VAT.
        </p>
      </div>
    </div>
  )
}
