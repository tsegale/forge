import { CircleAlert, CircleCheck, CircleDashed, LoaderCircle } from 'lucide-react'
import type { CompatibilityReport } from '@/builds/api'
import { findingLabel } from './findings'

type Finding = CompatibilityReport['conflicts'][number]

function Status({ report }: { report: CompatibilityReport }) {
  if (report.conflicts.length) {
    const count = report.conflicts.length
    return (
      <p className="flex items-center gap-2 font-medium text-danger-ink">
        <CircleAlert aria-hidden="true" className="h-5 w-5" />
        {count === 1 ? '1 conflict' : `${count} conflicts`}
      </p>
    )
  }
  if (!report.complete) {
    return (
      <p className="flex items-center gap-2 font-medium text-ink">
        <CircleDashed aria-hidden="true" className="h-5 w-5 text-accent" />
        Compatible so far
      </p>
    )
  }
  return (
    <p className="flex items-center gap-2 font-medium text-success-ink">
      <CircleCheck aria-hidden="true" className="h-5 w-5" />
      Compatible and complete
    </p>
  )
}

function Findings({ findings, tone }: { findings: Finding[]; tone: 'danger' | 'warning' }) {
  if (!findings.length) return null
  return (
    <ul className="space-y-2">
      {findings.map((finding) => (
        <li
          key={`${finding.code}-${finding.product_ids.join('-')}`}
          className={`rounded-md border-l-4 bg-canvas px-3 py-2 text-sm ${
            tone === 'danger' ? 'border-danger' : 'border-warning'
          }`}
        >
          <p className="font-medium">{findingLabel(finding.code)}</p>
          <p className="text-ink-muted">{finding.message}</p>
        </li>
      ))}
    </ul>
  )
}

/** The live compatibility verdict for the parts on screen. */
export function CompatibilityPanel({
  report,
  checking,
  kindLabel,
}: {
  report: CompatibilityReport | undefined
  checking: boolean
  kindLabel: (kind: string) => string
}) {
  return (
    <section aria-labelledby="compat-heading" className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 id="compat-heading" className="text-sm font-semibold">
          Compatibility
        </h3>
        <span aria-live="polite" className="text-xs text-ink-subtle">
          {checking ? (
            <span className="flex items-center gap-1">
              <LoaderCircle aria-hidden="true" className="h-3 w-3 animate-spin" />
              Checking
            </span>
          ) : null}
        </span>
      </div>
      {report ? (
        <>
          <div aria-live="polite">
            <Status report={report} />
          </div>
          <Findings findings={report.conflicts} tone="danger" />
          <Findings findings={report.warnings} tone="warning" />
          {report.missing_kinds.length ? (
            <p className="text-sm text-ink-muted">
              Still needed: {report.missing_kinds.map(kindLabel).join(', ')}
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-ink-muted">Choose parts to check how they work together.</p>
      )}
    </section>
  )
}
