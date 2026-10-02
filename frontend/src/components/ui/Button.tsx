import { Slot } from '@radix-ui/react-slot'
import { clsx } from 'clsx'
import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover disabled:bg-border-strong',
  secondary: 'border border-border-strong bg-surface text-ink hover:bg-canvas disabled:text-ink-subtle',
  danger: 'bg-danger text-white hover:opacity-90 disabled:opacity-50',
  ghost: 'text-ink-muted hover:bg-canvas hover:text-ink',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  busy?: boolean
  asChild?: boolean
}

export function Button({
  variant = 'primary',
  busy = false,
  asChild = false,
  className,
  children,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : 'button'
  return (
    <Component
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed',
        VARIANTS[variant],
        className,
      )}
      disabled={busy || props.disabled}
      aria-busy={busy || undefined}
      {...props}
    >
      {children}
    </Component>
  )
}
