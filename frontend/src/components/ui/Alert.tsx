import { clsx } from 'clsx'
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'

type Tone = 'info' | 'success' | 'warning' | 'danger'

const TONES: Record<Tone, { box: string; Icon: typeof Info }> = {
  info: { box: 'border-accent/30 bg-accent-soft text-ink', Icon: Info },
  success: { box: 'border-success/30 bg-success-soft text-ink', Icon: CircleCheck },
  warning: { box: 'border-warning/30 bg-warning-soft text-ink', Icon: TriangleAlert },
  danger: { box: 'border-danger/30 bg-danger-soft text-ink', Icon: CircleAlert },
}
const ICON_COLOR: Record<Tone, string> = {
  info: 'text-accent',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
}

export function Alert({
  tone = 'info',
  title,
  children,
}: {
  tone?: Tone
  title?: string
  children?: ReactNode
}) {
  const { box, Icon } = TONES[tone]
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={clsx('flex gap-3 rounded-md border p-3 text-sm', box)}
    >
      <Icon aria-hidden="true" className={clsx('mt-0.5 h-4 w-4 shrink-0', ICON_COLOR[tone])} />
      <div>
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className={title ? 'mt-1 text-ink-muted' : undefined}>{children}</div> : null}
      </div>
    </div>
  )
}
