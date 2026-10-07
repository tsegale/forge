import type { Step } from '@/components/ui/Stepper'

/** The purchase, start to finish: the same four steps on every checkout screen. */
export const CHECKOUT_STEPS: Step[] = [
  { id: 'delivery', label: 'Delivery' },
  { id: 'review', label: 'Review' },
  { id: 'payment', label: 'Payment' },
  { id: 'confirmation', label: 'Confirmation' },
]
