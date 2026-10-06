import { clsx } from 'clsx'
import { useId, type InputHTMLAttributes } from 'react'

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string | undefined
  hint?: string
}

/** Labelled input with an accessible error message (aria-invalid + aria-describedby). */
export function Field({ label, error, hint, className, ...props }: FieldProps) {
  const id = useId()
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <div className={clsx('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={clsx(
          'rounded-md border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-subtle',
          error ? 'border-danger' : 'border-border-strong',
        )}
        {...props}
      />
      {error ? (
        <p id={`${id}-error`} className="text-sm text-danger-ink">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-ink-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
