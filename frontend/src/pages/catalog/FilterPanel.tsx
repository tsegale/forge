import { useId } from 'react'
import { SPEC_FILTERS, type FilterDef } from '@/catalog/filters'

interface Props {
  kind: string | undefined
  params: URLSearchParams
  onChange: (key: string, value: string | null) => void
}

function FilterControl({
  def,
  value,
  onChange,
}: {
  def: FilterDef
  value: string
  onChange: (v: string | null) => void
}) {
  const id = useId()
  const control = 'w-full rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm'
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-ink-muted">
        {def.label}
      </label>
      {def.type === 'select' ? (
        <select
          id={id}
          className={control}
          value={value}
          onChange={(e) => {
            onChange(e.target.value || null)
          }}
        >
          <option value="">Any</option>
          {def.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : def.type === 'boolean' ? (
        <select
          id={id}
          className={control}
          value={value}
          onChange={(e) => {
            onChange(e.target.value || null)
          }}
        >
          <option value="">Any</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      ) : (
        <div className="flex items-center gap-2">
          <input
            id={id}
            type="number"
            min={0}
            inputMode="numeric"
            className={control}
            value={value}
            onChange={(e) => {
              onChange(e.target.value || null)
            }}
          />
          <span className="text-xs text-ink-subtle">{def.unit}</span>
        </div>
      )}
    </div>
  )
}

export function FilterPanel({ kind, params, onChange }: Props) {
  const defs = kind ? (SPEC_FILTERS[kind] ?? []) : []
  return (
    <aside aria-label="Filters" className="flex flex-col gap-4">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={params.get('in_stock') === 'true'}
          onChange={(e) => {
            onChange('in_stock', e.target.checked ? 'true' : null)
          }}
        />
        In stock only
      </label>
      {defs.length ? (
        defs.map((def) => (
          <FilterControl
            key={def.key}
            def={def}
            value={params.get(def.key) ?? ''}
            onChange={(v) => {
              onChange(def.key, v)
            }}
          />
        ))
      ) : (
        <p className="text-xs text-ink-subtle">Choose a category to filter by specifications.</p>
      )}
    </aside>
  )
}
