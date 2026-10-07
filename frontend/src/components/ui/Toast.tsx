import * as RadixToast from '@radix-ui/react-toast'
import { cn } from '@/lib/cn'
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { dismissToast, useToasts } from './toastStore'

const ICONS = { success: CircleCheck, info: Info, danger: CircleAlert } as const
const ICON_COLORS = { success: 'text-success', info: 'text-accent', danger: 'text-danger' } as const

/** Renders the toasts raised with toast() (toastStore.ts). Mount once near the root. */
export function Toaster() {
  const toasts = useToasts()
  return (
    <RadixToast.Provider swipeDirection="right" duration={5000} label="Notification">
      {toasts.map((item) => {
        const Icon = ICONS[item.tone]
        return (
          <RadixToast.Root
            key={item.id}
            type="foreground"
            onOpenChange={(open) => {
              if (!open) dismissToast(item.id)
            }}
            className={cn(
              'flex w-full items-start gap-3 rounded-md border border-border bg-surface p-4 shadow-lg',
              'data-[state=closed]:animate-[fade-out_120ms_ease-in] data-[state=open]:animate-[toast-in_200ms_var(--ease-out)]',
              'data-[swipe=end]:animate-[fade-out_120ms_ease-in] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)]',
            )}
          >
            <Icon aria-hidden="true" className={cn('mt-0.5 h-5 w-5 shrink-0', ICON_COLORS[item.tone])} />
            <div className="min-w-0 flex-1">
              <RadixToast.Title className="text-base font-medium text-ink">{item.title}</RadixToast.Title>
              {item.description ? (
                <RadixToast.Description className="mt-0.5 text-sm text-ink-muted">
                  {item.description}
                </RadixToast.Description>
              ) : null}
              {item.action ? (
                <RadixToast.Action
                  altText={item.action.label}
                  onClick={item.action.onClick}
                  className="mt-2 text-sm font-medium text-accent hover:text-accent-hover hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {item.action.label}
                </RadixToast.Action>
              ) : null}
            </div>
            <RadixToast.Close
              aria-label="Dismiss"
              className="rounded-sm p-1 text-ink-subtle hover:bg-surface-muted hover:text-ink"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </RadixToast.Close>
          </RadixToast.Root>
        )
      })}
      <RadixToast.Viewport className="fixed right-0 bottom-0 z-[60] flex w-full max-w-sm flex-col gap-2 p-4 outline-none" />
    </RadixToast.Provider>
  )
}
