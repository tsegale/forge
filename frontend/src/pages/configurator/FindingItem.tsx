import { CircleAlert, TriangleAlert } from 'lucide-react'
import type { CompatibilityReport } from '@/builds/api'
import { cn } from '@/lib/cn'
import { detailRows, findingLabel } from './findings'

export type Finding = CompatibilityReport['conflicts'][number]

/**
 * One compatibility finding: a short label, the engine's message, and the measured values it
 * compared (so "too long" comes with the two lengths), never colour alone.
 */
export function FindingItem({ finding, compact = false }: { finding: Finding; compact?: boolean }) {
  const conflict = finding.severity === 'conflict'
  const Icon = conflict ? CircleAlert : TriangleAlert
  const rows = detailRows(finding.details)
  return (
    <div
      className={cn(
        'rounded-sm border-l-4 px-3 py-2 text-sm',
        conflict ? 'border-danger bg-danger-soft' : 'border-warning bg-warning-soft',
      )}
    >
      <p
        className={cn(
          'flex items-center gap-1.5 font-medium',
          conflict ? 'text-danger-ink' : 'text-warning-ink',
        )}
      >
        <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span>
          <span className="sr-only">{conflict ? 'Conflict: ' : 'Warning: '}</span>
          {findingLabel(finding.code)}
        </span>
      </p>
      <p className="mt-0.5 text-ink">{finding.message}</p>
      {!compact && rows.length ? (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-sm">
          {rows.map((row, index) => (
            <div key={`${row.label}-${String(index)}`} className="contents">
              <dt className="text-ink-muted">{row.label}</dt>
              <dd className="font-tech text-ink tabular">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  )
}
