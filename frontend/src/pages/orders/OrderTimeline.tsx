import { clsx } from 'clsx'
import { Check, Circle, CircleDot } from 'lucide-react'
import { STATUS_LABELS, timeline, type OrderStatus, type StatusChange } from '@/orders/status'

const WHEN = new Intl.DateTimeFormat('en-NA', { dateStyle: 'medium', timeStyle: 'short' })

/** Vertical status timeline: what has happened (with times), then what is still to come. */
export function OrderTimeline({ status, history }: { status: OrderStatus; history: StatusChange[] }) {
  const steps = timeline(status, history)
  return (
    <ol className="space-y-0" aria-label="Order progress">
      {steps.map((step, index) => {
        const Icon = step.state === 'done' ? Check : step.state === 'current' ? CircleDot : Circle
        return (
          <li key={`${step.status}-${String(index)}`} className="relative flex gap-3 pb-5 last:pb-0">
            {index < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className={clsx(
                  'absolute top-6 left-3 h-[calc(100%-1.5rem)] w-px',
                  step.state === 'upcoming' ? 'bg-border' : 'bg-accent',
                )}
              />
            ) : null}
            <span
              className={clsx(
                'relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                step.state === 'upcoming' ? 'bg-canvas text-ink-subtle' : 'bg-accent-soft text-accent',
              )}
            >
              <Icon aria-hidden="true" className="h-3.5 w-3.5" />
            </span>
            <div className="text-sm" aria-current={step.state === 'current' ? 'step' : undefined}>
              <p className={step.state === 'upcoming' ? 'text-ink-subtle' : 'font-medium'}>
                {STATUS_LABELS[step.status]}
              </p>
              {step.at ? (
                <p className="text-xs text-ink-muted">
                  <time dateTime={step.at}>{WHEN.format(new Date(step.at))}</time>
                </p>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
