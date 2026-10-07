import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'

export interface Crumb {
  label: string
  to?: string
}

/** Where this page sits. The last crumb is the current page (aria-current), not a link. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-ink-subtle">
        {items.map((item, index) => {
          const last = index === items.length - 1
          return (
            <li key={`${item.label}-${String(index)}`} className="flex items-center gap-1">
              {item.to && !last ? (
                <Link to={item.to} className="rounded-sm hover:text-accent hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? 'page' : undefined}
                  className={last ? 'text-ink-muted' : undefined}
                >
                  {item.label}
                </span>
              )}
              {last ? null : <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
