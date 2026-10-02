import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { KindIcon } from '@/catalog/kinds'
import { KIND_LABELS } from '@/catalog/labels'
import { productQuery } from '@/catalog/queries'
import { specRows } from '@/catalog/specs'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { formatPrice } from '@/lib/money'
import { StockBadge } from './ProductCard'

export function ProductPage() {
  const { slug = '' } = useParams()
  const product = useQuery(productQuery(slug))

  if (product.isLoading) return <p className="text-sm text-ink-muted">Loading</p>
  if (product.isError) return <ErrorMessage error={product.error} />
  const p = product.data
  if (!p) return null

  return (
    <article className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_20rem]">
      <div>
        <nav aria-label="Breadcrumb" className="text-sm text-ink-subtle">
          <Link to="/" className="hover:text-accent">
            Catalog
          </Link>{' '}
          /{' '}
          <Link to={`/?kind=${p.kind}`} className="hover:text-accent">
            {KIND_LABELS[p.kind] ?? p.kind}
          </Link>
        </nav>
        <div className="mt-3 flex items-start gap-4">
          <span className="rounded-lg bg-accent-soft p-3 text-accent">
            <KindIcon kind={p.kind} className="h-8 w-8" />
          </span>
          <div>
            <p className="text-sm text-ink-subtle">{p.brand.name}</p>
            <h1 className="text-2xl font-semibold">{p.name}</h1>
            <p className="mt-1 font-mono text-xs text-ink-subtle">{p.sku}</p>
          </div>
        </div>
        {p.description ? <p className="mt-6 text-ink-muted">{p.description}</p> : null}
        <h2 className="mt-8 text-lg font-semibold">Specifications</h2>
        <table className="mt-3 w-full overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface text-sm">
          <tbody>
            {specRows(p.specs).map((row) => (
              <tr key={row.label} className="border-b border-border last:border-0">
                <th scope="row" className="w-1/2 px-4 py-2 text-left font-normal text-ink-muted">
                  {row.label}
                </th>
                <td className="px-4 py-2 tabular">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <aside className="h-fit rounded-[var(--radius-card)] border border-border bg-surface p-5">
        <p className="text-2xl font-semibold tabular">{formatPrice(p.price)}</p>
        <p className="text-xs text-ink-subtle">VAT included</p>
        <div className="mt-3">
          <StockBadge availability={p.availability} />
        </div>
      </aside>
    </article>
  )
}
