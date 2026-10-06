import { useQuery } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'
import { useDeferredValue, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { KIND_LABELS } from '@/catalog/labels'
import { searchHref, suggestQuery } from '@/catalog/search'
import { ProductImage } from '@/components/catalog/ProductImage'
import { cn } from '@/lib/cn'
import { formatPrice } from '@/lib/money'

interface Option {
  id: string
  href: string
  kind?: string
  label: ReactNode
  detail?: ReactNode
  product?: { name: string; kind: string }
}

/** The typed text, emphasised wherever it occurs in a name (case-insensitive). */
export function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim()
  if (!q) return <>{text}</>
  const parts: ReactNode[] = []
  const lower = text.toLowerCase()
  const needle = q.toLowerCase()
  let from = 0
  let at = lower.indexOf(needle)
  while (at !== -1) {
    if (at > from) parts.push(text.slice(from, at))
    parts.push(
      <mark key={at} className="bg-transparent font-semibold text-ink">
        {text.slice(at, at + q.length)}
      </mark>,
    )
    from = at + q.length
    at = lower.indexOf(needle, from)
  }
  if (from < text.length) parts.push(text.slice(from))
  return <>{parts}</>
}

/**
 * Header search with suggestions as you type (ARIA 1.2 combobox): products grouped by kind, SKU
 * fragments included ("x3d"), arrow keys to move, Enter to open, Escape to close. Enter with no
 * option chosen searches for the text. A typo gets a "did you mean" correction.
 */
export function SearchBox({ className, autoFocus = false }: { className?: string; autoFocus?: boolean }) {
  const navigate = useNavigate()
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const q = useDeferredValue(text.trim())
  const suggestions = useQuery(suggestQuery(q))
  const data = q.length >= 2 ? suggestions.data : undefined

  const groups = useMemo(() => {
    if (!data) return []
    return data.groups.map((group) => ({
      kind: group.kind,
      total: group.total,
      options: group.items.map<Option>((item) => ({
        id: `${listId}-p${String(item.id)}`,
        href: `/products/${item.slug}`,
        kind: item.kind,
        label: <Highlight text={item.name} query={q} />,
        detail: (
          <>
            <span className="font-tech">{item.sku}</span>
            <span className="tabular">{formatPrice(item.price)}</span>
          </>
        ),
        product: { name: item.name, kind: item.kind },
      })),
    }))
  }, [data, listId, q])

  const head: Option[] =
    q.length >= 2
      ? [
          {
            id: `${listId}-all`,
            href: searchHref(q),
            label: <>Search for &ldquo;{q}&rdquo;</>,
            detail: data ? `${String(data.total)} results` : undefined,
          },
        ]
      : []
  const fix: Option[] = data?.did_you_mean
    ? [
        {
          id: `${listId}-dym`,
          href: searchHref(data.did_you_mean),
          label: <>Did you mean &ldquo;{data.did_you_mean}&rdquo;?</>,
        },
      ]
    : []
  const options = [...head, ...fix, ...groups.flatMap((group) => group.options)]
  const expanded = open && options.length > 0

  const go = (href: string) => {
    setOpen(false)
    setActive(-1)
    void navigate(href)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setActive((i) => (options.length ? (i + 1) % options.length : -1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((i) => (options.length ? (i <= 0 ? options.length - 1 : i - 1) : -1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const chosen = active >= 0 ? options[active] : undefined
      if (chosen) go(chosen.href)
      else if (q) go(searchHref(q))
    } else if (event.key === 'Escape') {
      if (open) {
        setOpen(false)
        setActive(-1)
      } else setText('')
    }
  }

  const renderOption = (option: Option, index: number) => (
    <li
      key={option.id}
      id={option.id}
      role="option"
      aria-selected={active === index}
      onMouseDown={(event) => {
        event.preventDefault() // keep focus in the input until navigation
      }}
      onClick={() => {
        go(option.href)
      }}
      onMouseEnter={() => {
        setActive(index)
      }}
      className={cn(
        'flex cursor-pointer items-center gap-3 px-3 py-2',
        active === index ? 'bg-accent-soft' : 'hover:bg-surface-muted',
      )}
    >
      {option.product ? (
        <ProductImage
          kind={option.product.kind}
          name={option.product.name}
          variant="thumb"
          className="w-12 shrink-0"
        />
      ) : (
        <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-subtle" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base text-ink-muted">{option.label}</span>
        {option.detail ? <span className="flex gap-3 text-xs text-ink-subtle">{option.detail}</span> : null}
      </span>
    </li>
  )

  let index = 0
  return (
    <div className={cn('relative', className)}>
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault()
          if (q) go(searchHref(q))
        }}
      >
        <label htmlFor={`${listId}-input`} className="sr-only">
          Search products
        </label>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-subtle"
        />
        <input
          ref={inputRef}
          id={`${listId}-input`}
          type="search"
          role="combobox"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={expanded && active >= 0 ? options[active]?.id : undefined}
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder="Search by name or model, for example 7800X3D"
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            setOpen(true)
            setActive(-1)
          }}
          onFocus={() => {
            setOpen(true)
          }}
          onBlur={() => {
            setOpen(false)
          }}
          onKeyDown={onKeyDown}
          className="h-10 w-full rounded-md border border-control bg-surface pr-9 pl-9 text-base text-ink placeholder:text-ink-subtle hover:border-ink-subtle focus:border-accent focus:ring-3 focus:ring-accent/20 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {text ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setText('')
              inputRef.current?.focus()
            }}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-1 text-ink-subtle hover:text-ink"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        ) : null}
      </form>

      <div
        hidden={!expanded}
        className="absolute top-full right-0 left-0 z-50 mt-1.5 overflow-hidden rounded-md border border-border bg-surface shadow-lg"
      >
        <ul
          id={listId}
          role="listbox"
          aria-label="Search suggestions"
          className="max-h-[min(70vh,32rem)] overflow-y-auto py-1"
        >
          {[...head, ...fix].map((option) => renderOption(option, index++))}
          {groups.map((group) => (
            <li key={group.kind} role="presentation">
              <ul role="group" aria-labelledby={`${listId}-g-${group.kind}`}>
                <li
                  role="presentation"
                  id={`${listId}-g-${group.kind}`}
                  className="flex justify-between border-t border-border px-3 pt-2.5 pb-1 text-xs font-semibold tracking-wide text-ink-subtle uppercase"
                >
                  <span>{KIND_LABELS[group.kind] ?? group.kind}</span>
                  <span className="font-normal normal-case tabular">{group.total}</span>
                </li>
                {group.options.map((option) => renderOption(option, index++))}
              </ul>
            </li>
          ))}
          {data?.total === 0 && !data.did_you_mean ? (
            <li role="presentation" className="px-3 py-3 text-sm text-ink-subtle">
              No parts match. Try a model number or brand.
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  )
}
