import { cn } from '@/lib/cn'
import { ChevronDown } from 'lucide-react'
import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'

/**
 * Form controls. Each wires its label, hint and error together: the error is announced through
 * aria-describedby and aria-invalid, shown inline under the control, and never relies on colour
 * alone (it has an icon-free text message and a thicker red border).
 */

const CONTROL =
  'block w-full rounded-sm border bg-surface text-base text-ink placeholder:text-ink-subtle ' +
  'transition-[border-color,box-shadow] duration-150 ' +
  'hover:border-ink-subtle focus:border-accent focus:outline-none focus-visible:outline-none ' +
  'focus:ring-3 focus:ring-accent/20 ' +
  'disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-muted disabled:text-ink-subtle'

const BORDER = (invalid: boolean) =>
  invalid ? 'border-danger ring-1 ring-danger focus:border-danger focus:ring-danger/20' : 'border-control'

interface FieldChrome {
  label: string
  error?: string | undefined
  hint?: ReactNode
  /** Marks the field "(optional)" in its label; required fields are the default and unmarked. */
  optional?: boolean
  /** Visually hide the label (it stays for screen readers), e.g. a search box with a placeholder. */
  hideLabel?: boolean
}

function useDescribedBy(error: string | undefined, hint: ReactNode) {
  const id = useId()
  return {
    id,
    errorId: `${id}-error`,
    hintId: `${id}-hint`,
    describedBy:
      [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined,
  }
}

function Label({
  htmlFor,
  label,
  optional,
  hidden,
}: {
  htmlFor: string
  label: string
  optional?: boolean
  hidden?: boolean
}) {
  return (
    <label htmlFor={htmlFor} className={cn('text-sm font-medium text-ink', hidden && 'sr-only')}>
      {label}
      {optional ? <span className="font-normal text-ink-subtle"> (optional)</span> : null}
    </label>
  )
}

function Messages({
  error,
  errorId,
  hint,
  hintId,
}: {
  error?: string | undefined
  errorId: string
  hint?: ReactNode
  hintId: string
}) {
  return (
    <>
      {hint ? (
        <p id={hintId} className="text-xs text-ink-subtle">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm font-medium text-danger-ink">
          {error}
        </p>
      ) : null}
    </>
  )
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement>, FieldChrome {
  /** Content inside the right edge of the input, e.g. a show/hide password button or a unit. */
  trailing?: ReactNode
  leading?: ReactNode
}

/** Labelled text input with an inline error. */
export function Field({
  label,
  error,
  hint,
  optional,
  hideLabel,
  trailing,
  leading,
  className,
  ...props
}: FieldProps) {
  const { id, errorId, hintId, describedBy } = useDescribedBy(error, hint)
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id} label={label} optional={optional ?? false} hidden={hideLabel ?? false} />
      <div className="relative">
        {leading ? (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-subtle">
            {leading}
          </span>
        ) : null}
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(CONTROL, BORDER(Boolean(error)), 'h-10 px-3', leading && 'pl-9', trailing && 'pr-11')}
          {...props}
        />
        {trailing ? <span className="absolute inset-y-0 right-1 flex items-center">{trailing}</span> : null}
      </div>
      <Messages error={error} errorId={errorId} hint={hint} hintId={hintId} />
    </div>
  )
}

/** Labelled multi-line text input. */
export function TextArea({
  label,
  error,
  hint,
  optional,
  hideLabel,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & FieldChrome) {
  const { id, errorId, hintId, describedBy } = useDescribedBy(error, hint)
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id} label={label} optional={optional ?? false} hidden={hideLabel ?? false} />
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(CONTROL, BORDER(Boolean(error)), 'min-h-24 px-3 py-2')}
        {...props}
      />
      <Messages error={error} errorId={errorId} hint={hint} hintId={hintId} />
    </div>
  )
}

/**
 * Labelled select. Native on purpose: the platform picker is the most usable control on a phone,
 * works with every assistive technology, and needs no JavaScript.
 */
export function Select({
  label,
  error,
  hint,
  optional,
  hideLabel,
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & FieldChrome) {
  const { id, errorId, hintId, describedBy } = useDescribedBy(error, hint)
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id} label={label} optional={optional ?? false} hidden={hideLabel ?? false} />
      <div className="relative">
        <select
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(CONTROL, BORDER(Boolean(error)), 'h-10 cursor-pointer appearance-none pr-9 pl-3')}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-ink-subtle"
        />
      </div>
      <Messages error={error} errorId={errorId} hint={hint} hintId={hintId} />
    </div>
  )
}

interface ChoiceProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode
  description?: ReactNode
}

const CHOICE =
  'mt-0.5 h-4 w-4 shrink-0 cursor-pointer border-control text-accent ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

/** Checkbox with a clickable label (and optional description under it). */
export function Checkbox({ label, description, className, ...props }: ChoiceProps) {
  const id = useId()
  return (
    <div className={cn('flex items-start gap-2.5', className)}>
      <input
        id={id}
        type="checkbox"
        className={cn(CHOICE, 'rounded-sm')}
        aria-describedby={description ? `${id}-d` : undefined}
        {...props}
      />
      <div className="text-base">
        <label htmlFor={id} className="cursor-pointer text-ink">
          {label}
        </label>
        {description ? (
          <p id={`${id}-d`} className="text-sm text-ink-subtle">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  )
}

/** Radio button with a clickable label; group them in a fieldset with a legend. */
export function Radio({ label, description, className, ...props }: ChoiceProps) {
  const id = useId()
  return (
    <div className={cn('flex items-start gap-2.5', className)}>
      <input
        id={id}
        type="radio"
        className={cn(CHOICE, 'rounded-full')}
        aria-describedby={description ? `${id}-d` : undefined}
        {...props}
      />
      <div className="text-base">
        <label htmlFor={id} className="cursor-pointer text-ink">
          {label}
        </label>
        {description ? (
          <p id={`${id}-d`} className="text-sm text-ink-subtle">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  )
}
