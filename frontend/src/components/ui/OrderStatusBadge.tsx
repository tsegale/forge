import { clsx } from 'clsx'
import { STATUS_LABELS, STATUS_TONES, type OrderStatus } from '@/orders/status'

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={clsx(
        'inline-block rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        STATUS_TONES[status],
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}
