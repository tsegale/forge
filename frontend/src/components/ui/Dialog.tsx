import * as RadixDialog from '@radix-ui/react-dialog'
import { cn } from '@/lib/cn'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

const WIDTHS = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-4xl' } as const

const OVERLAY =
  'fixed inset-0 z-40 bg-ink/45 data-[state=open]:animate-[fade-in_150ms_ease-out] data-[state=closed]:animate-[fade-out_100ms_ease-in]'

function CloseButton() {
  return (
    <RadixDialog.Close
      className="-mr-1.5 rounded-md p-1.5 text-ink-subtle hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
      aria-label="Close"
    >
      <X aria-hidden="true" className="h-5 w-5" />
    </RadixDialog.Close>
  )
}

/** Modal dialog: focus trapped, Escape closes, labelled by its title, scrolls inside itself. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  wide = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  /** Actions pinned to the bottom (primary action last, on the right). */
  footer?: ReactNode
  size?: keyof typeof WIDTHS
  /** Deprecated alias for size="lg". */
  wide?: boolean
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={OVERLAY} />
        <RadixDialog.Content
          className={cn(
            'fixed top-1/2 left-1/2 z-50 flex max-h-[min(85vh,52rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col',
            'rounded-md border border-border bg-surface shadow-lg focus-visible:outline-none',
            WIDTHS[wide ? 'lg' : size],
          )}
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <RadixDialog.Title className="text-lg font-semibold text-ink">{title}</RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="mt-1 text-base text-ink-muted">
                  {description}
                </RadixDialog.Description>
              ) : null}
            </div>
            <CloseButton />
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? (
            <footer className="flex flex-wrap justify-end gap-2 border-t border-border bg-canvas px-5 py-3">
              {footer}
            </footer>
          ) : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}

/**
 * A panel that slides in from the right (from the bottom on a phone): the mini-cart, the part
 * picker, filters on mobile. Same focus handling as Dialog.
 */
export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = 'md',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: 'sm' | 'md' | 'lg'
}) {
  const widths = { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-2xl' }[width]
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={OVERLAY} />
        <RadixDialog.Content
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 flex max-h-[92vh] flex-col rounded-t-md border border-border bg-surface shadow-lg focus-visible:outline-none',
            'data-[state=open]:animate-[drawer-up_200ms_var(--ease-out)]',
            'sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-full sm:rounded-none sm:border-y-0 sm:border-r-0',
            'sm:data-[state=open]:animate-[drawer-in_200ms_var(--ease-out)]',
            widths,
          )}
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <RadixDialog.Title className="text-lg font-semibold text-ink">{title}</RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="mt-1 text-base text-ink-muted">
                  {description}
                </RadixDialog.Description>
              ) : null}
            </div>
            <CloseButton />
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? <footer className="border-t border-border bg-canvas px-5 py-4">{footer}</footer> : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
