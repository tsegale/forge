import * as RadixTabs from '@radix-ui/react-tabs'
import { cn } from '@/lib/cn'
import type { ReactNode } from 'react'

/** Tabs (Radix): arrow keys move between tabs, the panel is labelled by its tab. */
export const Tabs = RadixTabs.Root

export function TabList({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <RadixTabs.List
      aria-label={label}
      className={cn('relative flex gap-1 overflow-x-auto border-b border-border', className)}
    >
      {children}
    </RadixTabs.List>
  )
}

export function Tab({ value, children, count }: { value: string; children: ReactNode; count?: number }) {
  return (
    <RadixTabs.Trigger
      value={value}
      className={cn(
        '-mb-px inline-flex h-10 items-center gap-2 border-b-2 border-transparent px-3 text-base font-medium whitespace-nowrap text-ink-muted',
        'hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent',
        'data-[state=active]:border-accent data-[state=active]:text-ink',
      )}
    >
      {children}
      {count === undefined ? null : (
        <span className="rounded-full bg-surface-muted px-1.5 text-xs text-ink-subtle tabular">{count}</span>
      )}
    </RadixTabs.Trigger>
  )
}

export function TabPanel({
  value,
  children,
  className,
}: {
  value: string
  children: ReactNode
  className?: string
}) {
  return (
    <RadixTabs.Content value={value} className={cn('pt-5 focus-visible:outline-none', className)}>
      {children}
    </RadixTabs.Content>
  )
}
