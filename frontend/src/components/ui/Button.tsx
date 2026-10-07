import { Slot, Slottable } from '@radix-ui/react-slot'
import { cn } from '@/lib/cn'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Spinner } from './Spinner'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link'
export type ButtonSize = 'sm' | 'md' | 'lg'

const BASE =
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium ' +
  'transition-[background-color,border-color,color,box-shadow] duration-150 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ' +
  'disabled:pointer-events-none aria-disabled:pointer-events-none [&_svg]:shrink-0'

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'rounded-md bg-accent text-white shadow-sm hover:bg-accent-hover active:bg-accent-active ' +
    'disabled:bg-border-strong disabled:text-ink-muted disabled:shadow-none',
  secondary:
    'rounded-md border border-border-strong bg-surface text-ink shadow-sm hover:border-control ' +
    'hover:bg-surface-muted active:bg-border disabled:border-border disabled:text-ink-subtle',
  ghost:
    'rounded-md text-ink-muted hover:bg-surface-muted hover:text-ink active:bg-border ' +
    'disabled:text-ink-subtle',
  danger:
    'rounded-md bg-danger text-white shadow-sm hover:bg-danger-hover active:bg-danger-ink ' +
    'disabled:bg-border-strong disabled:text-ink-muted',
  link:
    'rounded-sm px-0 text-accent underline-offset-4 hover:text-accent-hover hover:underline ' +
    'active:text-accent-active disabled:text-ink-subtle',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-base',
  lg: 'h-12 px-6 text-md',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Shows a spinner, disables the button and sets aria-busy; the label stays for screen readers. */
  busy?: boolean
  /** Render the child (e.g. a router Link) with button styling instead of a <button>. */
  asChild?: boolean
  icon?: ReactNode
  iconAfter?: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  busy = false,
  asChild = false,
  icon,
  iconAfter,
  className,
  children,
  disabled,
  type,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : 'button'
  return (
    <Component
      className={cn(BASE, VARIANTS[variant], variant !== 'link' && SIZES[size], className)}
      disabled={asChild ? undefined : busy || disabled}
      aria-disabled={asChild && (busy || disabled) ? true : undefined}
      aria-busy={busy || undefined}
      type={asChild ? undefined : (type ?? 'button')}
      {...props}
    >
      {busy ? <Spinner /> : icon}
      <Slottable>{children}</Slottable>
      {iconAfter}
    </Component>
  )
}

/** A square button holding only an icon; `label` is its accessible name (and tooltip). */
export function IconButton({
  label,
  children,
  size = 'md',
  variant = 'ghost',
  className,
  ...props
}: Omit<ButtonProps, 'icon' | 'iconAfter' | 'aria-label'> & { label: string }) {
  const square = { sm: 'h-8 w-8', md: 'h-10 w-10', lg: 'h-12 w-12' }[size]
  return (
    <Button
      variant={variant}
      size={size}
      aria-label={label}
      title={label}
      className={cn('px-0', square, className)}
      {...props}
    >
      {children}
    </Button>
  )
}
