import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useAuth } from '@/auth/context'
import {
  buildQuery,
  buildsQuery,
  compatibilityQuery,
  saveDraft,
  validateBuild,
  type BuildDetail,
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
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { formatCents } from '@/lib/money'
import { CompatibilityPanel } from './CompatibilityPanel'
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

export function ConfiguratorPage() {
  const draft = useDraft()
  const { status, user } = useAuth()
  const signedIn = status === 'authenticated'
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [picker, setPicker] = useState<PickerTarget | null>(null)

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

  if (kinds.isError) return <ErrorMessage error={kinds.error} />
  const kindList = [...(kinds.data?.items ?? [])].sort((a, b) => a.sort_order - b.sort_order)
  const kindLabel = (code: string) => kindList.find((k) => k.code === code)?.label ?? code
  const conflictIds = new Set(report?.conflicts.flatMap((finding) => finding.product_ids))
  const psu = items.find((item) => item.product.specs.kind === 'psu')?.product.specs
  const psuWatts = psu?.kind === 'psu' ? psu.wattage_w : null
  const total = items.reduce((sum, item) => sum + item.product.price.amount_cents * item.quantity, 0)
  const validated = !dirty && saved.data?.status === 'validated'
  const ordered = !dirty && saved.data?.status === 'ordered'
  const buildId = draft.buildId

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_22rem]">
      <section aria-labelledby="configurator-heading">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 id="configurator-heading" className="text-2xl font-semibold">
              Build a PC
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              Parts are checked against each other as you choose them.
            </p>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Build name</span>
            <input
              value={draft.name}
              maxLength={120}
              onChange={(event) => {
                setDraft((current) => ({ ...current, name: event.target.value }))
              }}
              onBlur={() => {
                if (!draft.name.trim()) setDraft((current) => ({ ...current, name: DEFAULT_NAME }))
              }}
              className="w-64 rounded-md border border-border-strong bg-surface px-3 py-2"
            />
          </label>
        </div>

        {opening.isError ? (
          <div className="mt-4">
            <ErrorMessage error={opening.error} title="That build could not be opened." />
          </div>
        ) : null}

        <ul className="mt-6 space-y-3" aria-label="Components">
          {kindList.map((kind) => (
            <KindSlot
              key={kind.code}
              kind={kind}
              items={items.filter((item) => item.product.kind === kind.code)}
              conflictIds={conflictIds}
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
        className="h-fit space-y-6 rounded-[var(--radius-card)] border border-border bg-surface p-5 lg:sticky lg:top-6"
      >
        <CompatibilityPanel report={report} checking={compat.isFetching} kindLabel={kindLabel} />
        {compat.isError ? <ErrorMessage error={compat.error} /> : null}
        {report ? <PowerMeter power={report.power} psuWatts={psuWatts} /> : null}

        <div className="border-t border-border pt-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-ink-muted">Parts total</span>
            <span className="text-xl font-semibold tabular">{formatCents(total)}</span>
          </div>
          <p className="text-right text-xs text-ink-subtle">VAT included, shipping at checkout</p>
        </div>

        <div className="space-y-3">
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
              <SaveState
                buildId={buildId}
                dirty={dirty}
                hasItems={draft.items.length > 0}
                ordered={ordered}
              />
              {validated && buildId !== null ? (
                <>
                  <Alert tone="success" title="Validated">
                    Every part fits and nothing is missing. Prices are confirmed at checkout.
                  </Alert>
                  <Button asChild className="w-full">
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
              <Button asChild className="w-full">
                <Link to={`/login?next=${encodeURIComponent('/configurator?save=1')}`}>
                  Sign in to save and check out
                </Link>
              </Button>
              <p className="text-xs text-ink-subtle">
                Your parts are kept in this browser until you sign in.
              </p>
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
      </aside>

      <PartPicker
        target={picker}
        buildProductIds={draft.items.map((item) => item.product.id)}
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
    <p className="text-xs text-ink-subtle" aria-live="polite">
      {text}{' '}
      {buildId !== null ? (
        <Link to="/builds" className="text-accent hover:underline">
          My builds
        </Link>
      ) : null}
    </p>
  )
}
