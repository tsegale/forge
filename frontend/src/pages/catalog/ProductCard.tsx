import { Link } from 'react-router'
import type { components } from '@/api/schema'
import { KindIcon } from '@/catalog/kinds'
import { formatPrice } from '@/lib/money'

type Product = components['schemas']['ProductSummary']

export function StockBadge({ availability }: { availability: Product['availability'] }) {
  if (!availability.in_stock) return <span className="text-xs font-medium text-danger-ink">Out of stock</span>
  const low = availability.quantity_available <= 3
  return (
    <span className={`text-xs font-medium ${low ? 'text-warning-ink' : 'text-success-ink'}`}>
      {low ? `Only ${availability.quantity_available} left` : 'In stock'}
    </span>
  )
}

export function ProductCard({ product }: { product: Product }) {
  return (
    <li className="flex flex-col rounded-md border border-border bg-surface p-4 transition-shadow hover:shadow-sm">
      <div className="flex items-start gap-3">
        <span className="rounded-md bg-accent-soft p-2 text-accent">
          <KindIcon kind={product.kind} />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-ink-subtle">{product.brand.name}</p>
          <h2 className="text-sm leading-snug font-medium text-ink">
            <Link to={`/products/${product.slug}`} className="hover:text-accent">
              {product.name}
            </Link>
          </h2>
        </div>
      </div>
      <div className="mt-auto flex items-end justify-between pt-4">
        <p className="text-base font-semibold tabular">{formatPrice(product.price)}</p>
        <StockBadge availability={product.availability} />
      </div>
    </li>
  )
}
