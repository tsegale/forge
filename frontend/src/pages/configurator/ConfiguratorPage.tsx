import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronUp, CircleAlert, CircleCheck, CircleDashed, Pencil } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useAuth } from '@/auth/context'
import {
  buildQuery,
  buildsQuery,
  compatibilityQuery,
  saveDraft,
  validateBuild,
  type BuildDetail,
  type CompatibilityReport,
} from '@/builds/api'
import {
  addPart,
  DEFAULT_NAME,
  emptyDraft,
  fromBuild,
  partsKey,
  removePart,
  setQuantity,
  type Draft,
} from '@/builds/draft'
import { getDraft, setDraft, useDraft } from '@/builds/store'
import { useFreshItems } from '@/builds/useFreshItems'
import { isProductKind } from '@/catalog/filters'
import { componentKindsQuery } from '@/catalog/queries'
import { Alert } from '@/components/ui/Alert'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { Button } from '@/components/ui/Button'
import { Drawer } from '@/components/ui/Dialog'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { cn } from '@/lib/cn'
import { formatCents } from '@/lib/money'
import { usePageTitle } from '@/lib/usePageTitle'
import { CompatibilityPanel } from './CompatibilityPanel'
import type { Finding } from './FindingItem'
import { KindSlot } from './KindSlot'
import { PartPicker, type PickerTarget } from './PartPicker'
import { PowerMeter } from './PowerMeter'

const sameParts = (a: [number, number][], b: [number, number][]) =>
  a.length === b.length && a.every(([id, qty], i) => b[i]?.[0] === id && b[i][1] === qty)

/** Whether the draft differs from its saved build (or has none). */
function isDirty(saved: BuildDetail | undefined, draft: Draft, parts: [number, number][]): boolean {
  if (!saved) return true
  return saved.name !== draft.name || !sameParts(partsKey(saved.items), parts)
}

/**
 * The configurator: one slot per component kind, live compatibility from the engine (with the
 * measured values behind each finding), power estimate, save, validate and check out. On phones
 * the verdict and total stay docked at the bottom; the full summary opens in a sheet.
 */
export function ConfiguratorPage() {
  const draft = useDraft()
  const { status, user } = useAuth()
  const signedIn = status === 'authenticated'
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [picker, setPicker] = useState<PickerTarget | null>(null)
  const [summaryOpen, setSummaryOpen] = useState(false)
  usePageTitle('Build a PC')

  const kinds = useQuery(componentKindsQuery)
  const items = useFreshItems(draft.items)
  const parts = partsKey(draft.items)
  const compat = useQuery({ ...compatibilityQuery(parts), enabled: parts.length > 0 })
  const report = parts.length ? compat.data : undefined
  const saved = useQuery({
    ...buildQuery(draft.buildId ?? 0),
    enabled: signedIn && draft.buildId !== null,
  })

  // /configurator?build=12 opens a saved build (from the builds list).
  const openId = Number(params.get('build')) || null
  const opening = useQuery({ ...buildQuery(openId ?? 0), enabled: signedIn && openId !== null })
  useEffect(() => {
    if (!opening.data || !user) return
    setDraft(fromBuild(opening.data, user.id))
    setParams(
      (current) => {
        current.delete('build')
        return current
      },
      { replace: true },
    )
  }, [opening.data, user, setParams])

  const linkSaved = (build: BuildDetail) => {
    queryClient.setQueryData(buildQuery(build.id).queryKey, build)
    void queryClient.invalidateQueries({ queryKey: buildsQuery.queryKey, exact: true })
    // Keep anything changed while the save was in flight; only record the link.
    setDraft((current) => ({ ...current, buildId: build.id, ownerId: user?.id ?? null }))
  }

  const save = useMutation({ mutationFn: () => saveDraft(getDraft()), onSuccess: linkSaved })

  const dirty = isDirty(saved.data, draft, parts)

  const validate = useMutation({
    mutationFn: async () => {
      let build = saved.data
      if (dirty || !build || build.status === 'ordered') {
        build = await saveDraft(getDraft())
        linkSaved(build)
      }
      return { buildId: build.id, result: await validateBuild(build.id) }
    },
    onSuccess: ({ buildId }) => queryClient.invalidateQueries({ queryKey: buildQuery(buildId).queryKey }),
  })

  // Back from "sign in to save": save the guest draft to the new session's account.
  const wantsSave = params.get('save') === '1'
  const { mutate: saveNow } = save
  useEffect(() => {
    if (!wantsSave || !signedIn) return
    setParams(
      (current) => {
        current.delete('save')
        return current
      },
      { replace: true },
    )
    if (getDraft().items.length) saveNow()
  }, [wantsSave, signedIn, setParams, saveNow])

  if (kinds.isError) return <ErrorMessage error={kinds.error} onRetry={() => void kinds.refetch()} />
  const kindList = [...(kinds.data?.items ?? [])].sort((a, b) => a.sort_order - b.sort_order)
  const kindLabel = (code: string) => kindList.find((k) => k.code === code)?.label ?? code
  const findingsFor = (productId: number): Finding[] =>
    [...(report?.conflicts ?? []), ...(report?.warnings ?? [])].filter((f) =>
      f.product_ids.includes(productId),
    )
  const psu = items.find((item) => item.product.specs.kind === 'psu')?.product.specs
  const psuWatts = psu?.kind === 'psu' ? psu.wattage_w : null
  const total = items.reduce((sum, item) => sum + item.product.price.amount_cents * item.quantity, 0)
  const validated = !dirty && saved.data?.status === 'validated'
  const ordered = !dirty && saved.data?.status === 'ordered'
  const buildId = draft.buildId
  const required = kindList.filter((k) => k.required_in_build)
  const requiredDone = required.filter((k) => items.some((item) => item.product.kind === k.code)).length
  const partCount = items.reduce((sum, item) => sum + item.quantity, 0)

  const summary = (
    <div className="flex flex-col gap-6">
      <CompatibilityPanel report={report} checking={compat.isFetching} kindLabel={kindLabel} />
      {compat.isError ? <ErrorMessage error={compat.error} onRetry={() => void compat.refetch()} /> : null}
      {report ? <PowerMeter power={report.power} psuWatts={psuWatts} /> : null}

      <div className="border-t border-border pt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-base text-ink-muted">
            Parts total{partCount ? ` (${String(partCount)})` : ''}
          </span>
          <span className="text-2xl font-semibold tracking-tight text-ink tabular">{formatCents(total)}</span>
        </div>
        <p className="text-right text-sm text-ink-subtle">VAT included, delivery at checkout</p>
      </div>

      <div className="flex flex-col gap-3">
        {signedIn ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                busy={save.isPending}
                disabled={!draft.items.length || (!dirty && !ordered)}
                onClick={() => {
                  save.mutate()
                }}
              >
                {save.isPending ? 'Saving' : 'Save build'}
              </Button>
              <Button
                busy={validate.isPending}
                disabled={!draft.items.length || validated}
                onClick={() => {
                  validate.mutate()
                }}
              >
                {validate.isPending ? 'Validating' : 'Validate'}
              </Button>
            </div>
            <SaveState buildId={buildId} dirty={dirty} hasItems={draft.items.length > 0} ordered={ordered} />
            {validated && buildId !== null ? (
              <>
                <Alert tone="success" title="Validated">
                  Every part fits and nothing is missing. Prices are confirmed at checkout.
                </Alert>
                <Button asChild size="lg" className="w-full">
                  <Link to={`/checkout?build=${String(buildId)}`}>Check out this build</Link>
                </Button>
              </>
            ) : null}
            {validate.data && validate.data.result.status !== 'validated' ? (
              <Alert tone="warning" title="Not validated yet">
                {validationAdvice(validate.data.result)}
              </Alert>
            ) : null}
          </>
        ) : (
          <>
            <Button asChild size="lg" className="w-full">
              <Link to={`/login?next=${encodeURIComponent('/configurator?save=1')}`}>
                Sign in to save and check out
              </Link>
            </Button>
            <p className="text-sm text-ink-subtle">Your parts are kept in this browser until you sign in.</p>
          </>
        )}
        <ErrorMessage error={save.error ?? validate.error} />
        {draft.items.length ? (
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              setDraft(emptyDraft())
              save.reset()
              validate.reset()
            }}
          >
            Start a new build
          </Button>
        ) : null}
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-6 pb-24 lg:pb-0">
      <div>
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Build a PC' }]} />
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1
              id="configurator-heading"
              className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl"
            >
              Build a PC
            </h1>
            <p className="mt-1 text-base text-ink-muted">
              Each part is checked against the others as you choose it, with the measurements behind every
              verdict.
            </p>
          </div>
          <BuildName name={draft.name} />
        </div>
        {required.length ? (
          <div className="mt-5">
            <p aria-hidden="true" className="mb-1.5 flex justify-between text-sm text-ink-muted">
              <span>Required parts</span>
              <span className="tabular">
                {requiredDone} of {required.length}
              </span>
            </p>
            <ProgressBar
              value={requiredDone}
              max={required.length}
              label="Required parts chosen"
              valueText={`${String(requiredDone)} of ${String(required.length)} required parts`}
              tone={requiredDone === required.length ? 'success' : 'accent'}
            />
          </div>
        ) : null}
      </div>

      {opening.isError ? (
        <ErrorMessage error={opening.error} title="That build could not be opened." />
      ) : null}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <section aria-labelledby="configurator-heading">
          <ul className="flex flex-col gap-3" aria-label="Components">
            {kindList.map((kind) => (
              <KindSlot
                key={kind.code}
                kind={kind}
                items={items.filter((item) => item.product.kind === kind.code)}
                findingsFor={findingsFor}
                missing={report?.missing_kinds.includes(kind.code) ?? false}
                editable
                onChoose={() => {
                  if (!isProductKind(kind.code)) return
                  setPicker({ kind: kind.code, label: kind.label, replaces: kind.max_per_build === 1 })
                }}
                onQuantity={(productId, quantity) => {
                  setDraft((current) => setQuantity(current, productId, quantity, kind.max_per_build))
                }}
                onRemove={(productId) => {
                  setDraft((current) => removePart(current, productId))
                }}
              />
            ))}
          </ul>
        </section>

        <aside
          aria-label="Build summary"
          className="hidden h-fit rounded-md border border-border bg-surface p-5 lg:sticky lg:top-28 lg:block"
        >
          {summary}
        </aside>
      </div>

      <DockedBar
        status={<DockStatus report={report} checking={compat.isFetching} />}
        total={formatCents(total)}
        onOpen={() => {
          setSummaryOpen(true)
        }}
      />
      <Drawer open={summaryOpen} onOpenChange={setSummaryOpen} title="Build summary" width="md">
        {summary}
      </Drawer>

      <PartPicker
        target={picker}
        buildProductIds={draft.items.flatMap((item) => Array<number>(item.quantity).fill(item.product.id))}
        selectedIds={new Set(draft.items.map((item) => item.product.id))}
        onPick={(product) => {
          const max = kindList.find((k) => k.code === product.kind)?.max_per_build ?? 1
          setDraft((current) => addPart(current, product, max))
          setPicker(null)
        }}
        onClose={() => {
          setPicker(null)
        }}
      />
    </div>
  )
}

/** The build's name, edited in place; an empty name falls back to the default. */
function BuildName({ name }: { name: string }) {
  return (
    <label className="group flex items-center gap-2 rounded-md border border-transparent px-2 py-1 focus-within:border-accent hover:border-control">
      <span className="sr-only">Build name</span>
      <input
        value={name}
        maxLength={120}
        onChange={(event) => {
          setDraft((current) => ({ ...current, name: event.target.value }))
        }}
        onBlur={() => {
          if (!name.trim()) setDraft((current) => ({ ...current, name: DEFAULT_NAME }))
        }}
        className="w-56 bg-transparent text-lg font-medium text-ink outline-none"
      />
      <Pencil aria-hidden="true" className="h-4 w-4 text-ink-subtle group-hover:text-ink" />
    </label>
  )
}

function DockStatus({ report, checking }: { report: CompatibilityReport | undefined; checking: boolean }) {
  if (!report) return <span className="text-ink-muted">No parts yet</span>
  if (report.conflicts.length) {
    return (
      <span className="flex items-center gap-1.5 font-medium text-danger-ink">
        <CircleAlert aria-hidden="true" className="h-4 w-4" />
        {report.conflicts.length === 1 ? '1 conflict' : `${String(report.conflicts.length)} conflicts`}
      </span>
    )
  }
  return (
    <span
      className={cn(
        'flex items-center gap-1.5 font-medium',
        report.complete ? 'text-success-ink' : 'text-ink',
      )}
    >
      {report.complete ? (
        <CircleCheck aria-hidden="true" className="h-4 w-4" />
      ) : (
        <CircleDashed aria-hidden="true" className="h-4 w-4 text-accent" />
      )}
      {checking ? 'Checking' : report.complete ? 'Ready to validate' : 'Compatible so far'}
    </span>
  )
}

/** Below lg: the verdict and total stay in reach; the full summary opens in a sheet. */
function DockedBar({ status, total, onOpen }: { status: ReactNode; total: string; onOpen: () => void }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface shadow-[0_-4px_12px_rgb(0_0_0/0.06)] lg:hidden">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
        <div className="min-w-0 flex-1 text-sm" aria-live="polite">
          {status}
          <p className="text-lg font-semibold text-ink tabular">{total}</p>
        </div>
        <Button onClick={onOpen} aria-haspopup="dialog">
          Summary
          <ChevronUp aria-hidden="true" className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

function validationAdvice(result: { compatible: boolean; complete: boolean }): string {
  if (!result.compatible && !result.complete) {
    return 'Resolve the conflicts and add the missing parts listed above, then validate again.'
  }
  return result.compatible
    ? 'Add the missing parts listed above, then validate again.'
    : 'Resolve the conflicts listed above, then validate again.'
}

function SaveState({
  buildId,
  dirty,
  hasItems,
  ordered,
}: {
  buildId: number | null
  dirty: boolean
  hasItems: boolean
  ordered: boolean
}) {
  let text: string
  if (ordered) text = 'This build has been ordered. Saving changes creates a new build.'
  else if (buildId === null) text = hasItems ? 'Not saved yet.' : ''
  else text = dirty ? 'Unsaved changes.' : 'All changes saved.'
  if (!text) return null
  return (
    <p className="text-sm text-ink-subtle" aria-live="polite">
      {text}{' '}
      {buildId !== null ? (
        <Link to="/builds" className="text-accent hover:underline">
          My builds
        </Link>
      ) : null}
    </p>
  )
}
