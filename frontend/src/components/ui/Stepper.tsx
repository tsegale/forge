import { cn } from '@/lib/cn'
import { Check } from 'lucide-react'

export interface Step {
  id: string
  label: string
}

/**
 * Progress through a fixed sequence (checkout). Completed steps can be links back when `onSelect`
 * is given; the current step carries aria-current="step". On a phone it collapses to
 * "Step 2 of 3: Review".
 */
export function Stepper({
  steps,
  current,
  onSelect,
  label = 'Progress',
  className,
}: {
  label?: string
  steps: Step[]
  current: string
  onSelect?: (id: string) => void
  className?: string
}) {
  const index = Math.max(
    0,
    steps.findIndex((step) => step.id === current),
  )
  return (
    <nav aria-label={label} className={className}>
      <p className="text-sm text-ink-muted sm:hidden">
        Step {index + 1} of {steps.length}:{' '}
        <span className="font-medium text-ink">{steps[index]?.label}</span>
      </p>
      <ol className="hidden items-center gap-3 sm:flex">
        {steps.map((step, i) => {
          const state = i < index ? 'done' : i === index ? 'current' : 'upcoming'
          const marker = (
            <span
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular',
                state === 'done' && 'border-accent bg-accent text-white',
                state === 'current' && 'border-accent bg-surface text-accent',
                state === 'upcoming' && 'border-border-strong bg-surface text-ink-subtle',
              )}
            >
              {state === 'done' ? (
                <Check aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={3} />
              ) : (
                i + 1
              )}
            </span>
          )
          const text = (
            <span
              className={cn('text-base', state === 'upcoming' ? 'text-ink-subtle' : 'font-medium text-ink')}
            >
              {step.label}
              {state === 'done' ? <span className="sr-only"> (completed)</span> : null}
            </span>
          )
          return (
            <li
              key={step.id}
              className="flex items-center gap-3"
              aria-current={state === 'current' ? 'step' : undefined}
            >
              {state === 'done' && onSelect ? (
                <button
                  type="button"
                  onClick={() => {
                    onSelect(step.id)
                  }}
                  className="flex items-center gap-2 rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {marker}
                  {text}
                </button>
              ) : (
                <span className="flex items-center gap-2">
                  {marker}
                  {text}
                </span>
              )}
              {i < steps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={cn('h-px w-10 lg:w-16', i < index ? 'bg-accent' : 'bg-border-strong')}
                />
              ) : null}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
