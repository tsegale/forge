import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router'
import { addPart } from '@/builds/draft'
import { setDraft, useDraft } from '@/builds/store'
import { KindIcon } from '@/catalog/kinds'
import { inSentence, KIND_LABELS } from '@/catalog/labels'
import { componentKindsQuery, productQuery } from '@/catalog/queries'
import { Button } from '@/components/ui/Button'
import { specRows } from '@/catalog/specs'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { formatPrice } from '@/lib/money'
import { StockBadge } from './ProductCard'

export function ProductPage() {
  const { slug = '' } = useParams()
  const product = useQuery(productQuery(slug))
  const kinds = useQuery(componentKindsQuery)
  const draft = useDraft()
  const navigate = useNavigate()

  if (product.isPending) return <p className="text-sm text-ink-muted">Loading</p>
  if (product.isError) return <ErrorMessage error={product.error} />
  const p = product.data

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
        <AddToBuild
          kind={kinds.data?.items.find((k) => k.code === p.kind)}
          inBuild={draft.items.some((item) => item.product.id === p.id)}
          disabled={!p.availability.in_stock}
          onAdd={(max) => {
            setDraft((current) => addPart(current, p, max))
            void navigate('/configurator')
          }}
        />
      </aside>
    </article>
  )
}

function AddToBuild({
  kind,
  inBuild,
  disabled,
  onAdd,
}: {
  kind: { max_per_build: number; label: string } | undefined
  inBuild: boolean
  disabled: boolean
  onAdd: (max: number) => void
}) {
  if (!kind) return null
  const replaces = kind.max_per_build === 1
  return (
    <div className="mt-5 space-y-2">
      <Button
        variant="secondary"
        className="w-full"
        disabled={disabled || (inBuild && replaces)}
        onClick={() => {
          onAdd(kind.max_per_build)
        }}
      >
        {inBuild && replaces ? 'In your build' : 'Add to build'}
      </Button>
      {replaces && !inBuild ? (
        <p className="text-xs text-ink-subtle">
          Replaces any {inSentence(kind.label)} already in your build.
        </p>
      ) : null}
    </div>
  )
}
