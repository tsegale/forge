import { useQuery } from '@tanstack/react-query'
import { CircleAlert, CircleCheck, Layers, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'
import { compatibilityQuery, type CompatibilityReport } from '@/builds/api'
import { addPart, partsKey, type Draft, type ProductSummary } from '@/builds/draft'
import { inSentence } from '@/catalog/labels'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/cn'

type Finding = CompatibilityReport['conflicts'][number]

interface Kind {
  code: string
  label: string
  max_per_build: number
}

/**
 * Would this part work in the build being configured? Runs the same engine as the configurator
 * on the build with this part added (or swapped in, for a single-slot kind) and reports only the
 * findings that involve this part, in the engine's own words with its measured values.
 */
export function BuildVerdict({
  product,
  draft,
  kind,
}: {
  product: ProductSummary
  draft: Draft
  kind: Kind
}) {
  const inBuild = draft.items.some((item) => item.product.id === product.id)
  const replaced =
    kind.max_per_build === 1 && !inBuild
      ? draft.items.find((item) => item.product.kind === product.kind)
      : undefined
  const parts = partsKey(inBuild ? draft.items : addPart(draft, product, kind.max_per_build).items)
  const report = useQuery({ ...compatibilityQuery(parts), enabled: draft.items.length > 0 })

  if (!draft.items.length) {
    return (
      <section
        aria-labelledby="verdict-title"
        className="rounded-md border border-border bg-surface-muted p-4"
      >
        <h2 id="verdict-title" className="flex items-center gap-2 text-base font-semibold text-ink">
          <Layers aria-hidden="true" className="h-4 w-4 text-ink-subtle" /> Will it fit?
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Add it to a build and Forge checks it against every other part: socket, memory, size and power.
        </p>
      </section>
    )
  }

  const mine = (findings: Finding[] = []) => findings.filter((f) => f.product_ids.includes(product.id))
  const conflicts = mine(report.data?.conflicts)
  const warnings = mine(report.data?.warnings)
  const tone = conflicts.length ? 'danger' : warnings.length ? 'warning' : 'success'
  const Icon = { danger: CircleAlert, warning: TriangleAlert, success: CircleCheck }[tone]
  const heading = conflicts.length
    ? 'Does not fit your build'
    : warnings.length
      ? 'Fits your build, with a note'
      : inBuild
        ? 'In your build, no conflicts'
        : 'Fits your build'

  return (
    <section
      aria-labelledby="verdict-title"
      aria-busy={report.isFetching}
      className={cn(
        'rounded-md border p-4',
        report.isPending || report.isError
          ? 'border-border bg-surface-muted'
          : {
              danger: 'border-danger/40 bg-danger-soft',
              warning: 'border-warning/40 bg-warning-soft',
              success: 'border-success/40 bg-success-soft',
            }[tone],
      )}
    >
      {report.isPending || report.isError ? (
        <>
          <h2 id="verdict-title" className="text-base font-semibold text-ink">
            {report.isError ? 'Compatibility check unavailable' : 'Checking against your build'}
          </h2>
          {report.isError ? (
            <p className="mt-1 text-sm text-ink-muted">Try again in a moment, or open the configurator.</p>
          ) : (
            <Skeleton className="mt-2 h-4 w-full" />
          )}
        </>
      ) : (
        <>
          <h2
            id="verdict-title"
            className={cn(
              'flex items-center gap-2 text-base font-semibold',
              { danger: 'text-danger-ink', warning: 'text-warning-ink', success: 'text-success-ink' }[tone],
            )}
          >
            <Icon aria-hidden="true" className="h-4.5 w-4.5" /> {heading}
          </h2>
          {[...conflicts, ...warnings].length ? (
            <ul className="mt-2 flex flex-col gap-1.5 text-sm text-ink">
              {[...conflicts, ...warnings].map((finding) => (
                <li key={`${finding.code}-${finding.product_ids.join('-')}`}>{finding.message}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-ink-muted">
              Checked against the {draft.items.length} {draft.items.length === 1 ? 'part' : 'parts'} in{' '}
              <Link to="/configurator" className="font-medium text-accent hover:underline">
                {draft.name}
              </Link>
              .
            </p>
          )}
          {replaced ? (
            <p className="mt-2 text-sm text-ink-muted">
              Adding it replaces your {inSentence(kind.label)}, {replaced.product.name}.
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}
