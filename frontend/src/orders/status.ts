import type { components } from '@/api/schema'

export type OrderStatus = components['schemas']['OrderStatus']
export type StatusChange = components['schemas']['StatusChange']

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: 'Awaiting payment',
  paid: 'Paid',
  fulfilling: 'Being prepared',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
}

export const STATUS_TONES: Record<OrderStatus, string> = {
  pending_payment: 'bg-warning-soft text-warning-ink',
  paid: 'bg-accent-soft text-accent',
  fulfilling: 'bg-accent-soft text-accent',
  shipped: 'bg-accent-soft text-accent',
  delivered: 'bg-success-soft text-success-ink',
  cancelled: 'bg-canvas text-ink-muted',
  refunded: 'bg-canvas text-ink-muted',
}

/** The happy path an order moves along; cancelled and refunded leave it. */
const PATH: OrderStatus[] = ['pending_payment', 'paid', 'fulfilling', 'shipped', 'delivered']

export interface TimelineStep {
  status: OrderStatus
  at: string | null
  state: 'done' | 'current' | 'upcoming'
}

/**
 * Steps to show for an order: everything that has happened (from the audit history, in order),
 * then, while the order is still on the happy path, the steps still to come.
 */
export function timeline(status: OrderStatus, history: StatusChange[]): TimelineStep[] {
  const happened = [...history].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  const steps: TimelineStep[] = happened.map((change, index) => ({
    status: change.to_status,
    at: change.at,
    state: index === happened.length - 1 ? 'current' : 'done',
  }))
  const position = PATH.indexOf(status)
  if (position === -1) return steps
  for (const upcoming of PATH.slice(position + 1)) {
    steps.push({ status: upcoming, at: null, state: 'upcoming' })
  }
  return steps
}

const PAYMENT_LABELS: Record<string, string> = {
  requires_payment: 'Not paid yet',
  processing: 'Processing',
  succeeded: 'Paid by card',
  failed: 'Last attempt failed',
  canceled: 'Cancelled',
  refunded: 'Refunded',
}

/** The latest payment attempt's status, for people. */
export function paymentLabel(status: string | null): string {
  return status ? (PAYMENT_LABELS[status] ?? status) : 'Not started'
}
