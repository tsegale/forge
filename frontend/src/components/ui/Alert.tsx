import { cn } from '@/lib/cn'
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export type AlertTone = 'info' | 'success' | 'warning' | 'danger'

const TONES: Record<AlertTone, { box: string; icon: string; Icon: LucideIcon }> = {
  info: { box: 'border-accent/25 bg-accent-soft', icon: 'text-accent', Icon: Info },
  success: { box: 'border-success/30 bg-success-soft', icon: 'text-success', Icon: CircleCheck },
  warning: { box: 'border-warning/35 bg-warning-soft', icon: 'text-warning', Icon: TriangleAlert },
  danger: { box: 'border-danger/30 bg-danger-soft', icon: 'text-danger', Icon: CircleAlert },
}

/**
 * An inline message. Danger alerts are announced assertively (role="alert"); the others politely
 * (role="status"). Pass `action` for a follow-up button or link on the right.
 */
export function Alert({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: AlertTone
  title?: string
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  const { box, icon, Icon } = TONES[tone]
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-md border p-3.5 text-base', box, className)}
    >
      <Icon aria-hidden="true" className={cn('mt-0.5 h-4 w-4 shrink-0', icon)} strokeWidth={2} />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-medium text-ink">{title}</p> : null}
        {children ? <div className={cn('text-ink-muted', title && 'mt-0.5')}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  )
}
