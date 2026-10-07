import { Link } from 'react-router'
import type { components } from '@/api/schema'
import { COMPAT_PARAM, INCOMPATIBLE_PARAM, SPEC_FILTERS, type FilterDef } from '@/catalog/filters'
import { KIND_LABELS } from '@/catalog/labels'
import { Checkbox, Field, Select } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { centsToInput, formatCents, parseCents } from '@/lib/money'
import { useState, type ReactNode, type SyntheticEvent } from 'react'

type Facets = components['schemas']['ProductFacets']

export interface FilterPanelProps {
  kind: string | undefined
  params: URLSearchParams
  facets: Facets | undefined
  /** Set (or with null, clear) URL parameters, as one history entry. */
  onChange: (changes: Record<string, string | null>) => void
  kindHref: (kind: string | null) => string
  /** Parts in the configurator's build, for the compatibility filter. */
  buildParts: number
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="border-t border-border pt-4 first:border-t-0 first:pt-0">
      <legend className="float-left mb-3 w-full text-sm font-semibold text-ink">{title}</legend>
      <div className="clear-left flex flex-col gap-2.5">{children}</div>
    </fieldset>
  )
}

function Count({ n }: { n: number | undefined }) {
  return n === undefined ? null : <span className="ml-1 text-sm text-ink-subtle tabular">({n})</span>
}

/** Number filters commit on Enter or blur, not on every keystroke. */
function NumberFilter({
  def,
  value,
  onCommit,
}: {
  def: Extract<FilterDef, { type: 'number' }>
  value: string
  onCommit: (value: string | null) => void
}) {
  return (
    <Field
      key={value}
      label={`${def.label} (${def.unit})`}
      type="number"
      min={1}
      inputMode="numeric"
      defaultValue={value}
      onBlur={(event) => {
        const next = event.currentTarget.value.trim()
        if (next !== value) onCommit(next || null)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
    />
  )
}

function SpecFilter({
  def,
  value,
  onChange,
}: {
  def: FilterDef
  value: string
  onChange: (value: string | null) => void
}) {
  if (def.type === 'number') return <NumberFilter def={def} value={value} onCommit={onChange} />
  const options =
    def.type === 'select'
      ? def.options
      : [
          { value: 'true', label: 'Yes' },
          { value: 'false', label: 'No' },
        ]
  return (
    <Select
      label={def.label}
      value={value}
      onChange={(event) => {
        onChange(event.target.value || null)
      }}
    >
      <option value="">Any</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  )
}

function PriceFilter({
  params,
  span,
  onChange,
}: {
  params: URLSearchParams
  span: Facets['price'] | undefined
  onChange: FilterPanelProps['onChange']
}) {
  const current = (key: string) => {
    const cents = Number(params.get(key))
    return params.get(key) && Number.isSafeInteger(cents) ? centsToInput(cents) : ''
  }
  const [error, setError] = useState<string | undefined>()
  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const read = (name: string) => {
      const value = data.get(name)
      const raw = typeof value === 'string' ? value.trim() : ''
      return raw ? parseCents(raw) : undefined
    }
    const min = read('min')
    const max = read('max')
    if (min === null || max === null) {
      setError('Enter amounts such as 1500 or 1,499.99.')
      return
    }
    if (min !== undefined && max !== undefined && min > max) {
      setError('The minimum is above the maximum.')
      return
    }
    setError(undefined)
    onChange({
      min_price: min === undefined ? null : String(min),
      max_price: max === undefined ? null : String(max),
    })
  }
  const key = `${params.get('min_price') ?? ''}-${params.get('max_price') ?? ''}`
  return (
    <form key={key} onSubmit={submit} noValidate className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-2">
        <Field
          label="Minimum (N$)"
          name="min"
          inputMode="decimal"
          defaultValue={current('min_price')}
          placeholder={span ? centsToInput(span.min_cents) : undefined}
        />
        <Field
          label="Maximum (N$)"
          name="max"
          inputMode="decimal"
          defaultValue={current('max_price')}
          placeholder={span ? centsToInput(span.max_cents) : undefined}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger-ink">
          {error}
        </p>
      ) : span ? (
        <p className="text-sm text-ink-subtle">
          From {formatCents(span.min_cents)} to {formatCents(span.max_cents)}
        </p>
      ) : null}
      <Button type="submit" variant="secondary" size="sm" className="self-start">
        Apply price
      </Button>
    </form>
  )
}

/**
 * The filter sidebar (a drawer on smaller screens). Every control writes to the URL, so a
 * filtered listing can be bookmarked, shared and navigated with Back. Counts come from the
 * facets endpoint, each ignoring its own filter, so the alternatives stay visible.
 */
export function FilterPanel({ kind, params, facets, onChange, kindHref, buildParts }: FilterPanelProps) {
  const defs = kind ? (SPEC_FILTERS[kind] ?? []) : []
  const brands = new Set(params.get('brand')?.split(',').filter(Boolean) ?? [])
  const fitsBuild = params.get(COMPAT_PARAM) === '1'
  const compatible = kind !== undefined && kind !== 'accessory'

  return (
    <div className="flex flex-col gap-5">
      <nav aria-label="Categories" className="border-b border-border pb-4">
        <h2 className="mb-2 text-sm font-semibold text-ink">Category</h2>
        <ul className="flex flex-col">
          <li>
            <Link
              to={kindHref(null)}
              aria-current={kind === undefined ? 'page' : undefined}
              className={cn(
                'flex justify-between rounded-sm px-2 py-1.5 text-base hover:bg-surface-muted',
                kind === undefined ? 'font-medium text-accent' : 'text-ink-muted',
              )}
            >
              All categories
            </Link>
          </li>
          {(facets?.kinds ?? []).map((k) => (
            <li key={k.kind}>
              <Link
                to={kindHref(k.kind)}
                aria-current={kind === k.kind ? 'page' : undefined}
                className={cn(
                  'flex justify-between rounded-sm px-2 py-1.5 text-base hover:bg-surface-muted',
                  kind === k.kind ? 'bg-accent-soft font-medium text-accent' : 'text-ink-muted',
                )}
              >
                {KIND_LABELS[k.kind] ?? k.kind}
                <span className="text-sm text-ink-subtle tabular">{k.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {compatible ? (
        <Section title="Compatibility">
          {buildParts > 0 ? (
            <>
              <Checkbox
                label="Only parts that fit my build"
                description={`Checked against the ${String(buildParts)} ${buildParts === 1 ? 'part' : 'parts'} in your build.`}
                checked={fitsBuild}
                onChange={(event) => {
                  onChange({ [COMPAT_PARAM]: event.target.checked ? '1' : null, [INCOMPATIBLE_PARAM]: null })
                }}
              />
              {fitsBuild ? (
                <Checkbox
                  className="ml-6"
                  label={
                    <>
                      Also show parts that do not fit
                      <Count n={facets?.incompatible ?? undefined} />
                    </>
                  }
                  description="Each one says why."
                  checked={params.get(INCOMPATIBLE_PARAM) === '1'}
                  onChange={(event) => {
                    onChange({ [INCOMPATIBLE_PARAM]: event.target.checked ? '1' : null })
                  }}
                />
              ) : null}
            </>
          ) : (
            <p className="text-sm text-ink-muted">
              <Link to="/configurator" className="font-medium text-accent hover:underline">
                Start a build
              </Link>{' '}
              to see only the parts that fit it.
            </p>
          )}
        </Section>
      ) : null}

      <Section title="Availability">
        <Checkbox
          label={
            <>
              In stock
              <Count n={facets?.in_stock} />
            </>
          }
          checked={params.get('in_stock') === 'true'}
          onChange={(event) => {
            onChange({ in_stock: event.target.checked ? 'true' : null })
          }}
        />
      </Section>

      <Section title="Price">
        <PriceFilter params={params} span={facets?.price} onChange={onChange} />
      </Section>

      {facets?.brands.length ? (
        <Section title="Brand">
          {facets.brands.map((brand) => (
            <Checkbox
              key={brand.slug}
              label={
                <>
                  {brand.name}
                  <Count n={brand.count} />
                </>
              }
              checked={brands.has(brand.slug)}
              onChange={(event) => {
                const next = new Set(brands)
                if (event.target.checked) next.add(brand.slug)
                else next.delete(brand.slug)
                onChange({ brand: next.size ? [...next].sort().join(',') : null })
              }}
            />
          ))}
        </Section>
      ) : null}

      {defs.length ? (
        <Section title="Specifications">
          {defs.map((def) => (
            <SpecFilter
              key={def.key}
              def={def}
              value={params.get(def.key) ?? ''}
              onChange={(value) => {
                onChange({ [def.key]: value })
              }}
            />
          ))}
        </Section>
      ) : kind === undefined ? (
        <p className="border-t border-border pt-4 text-sm text-ink-subtle">
          Choose a category to filter by specifications.
        </p>
      ) : null}
    </div>
  )
}
