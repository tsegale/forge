import { clsx } from 'clsx'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import type { components } from '@/api/schema'
import type { FreshItem } from '@/builds/useFreshItems'
import { KindIcon } from '@/catalog/kinds'
import { inSentence } from '@/catalog/labels'
import { Button } from '@/components/ui/Button'
import { formatCents } from '@/lib/money'

type ComponentKind = components['schemas']['ComponentKindResponse']

/** One row of the configurator: a component kind and the parts chosen for it. */
export function KindSlot({
  kind,
  items,
  conflictIds,
  missing,
  editable,
  onChoose,
  onQuantity,
  onRemove,
}: {
  kind: ComponentKind
  items: FreshItem[]
  conflictIds: Set<number>
  missing: boolean
  editable: boolean
  onChoose: () => void
  onQuantity: (productId: number, quantity: number) => void
  onRemove: (productId: number) => void
}) {
  const count = items.reduce((sum, item) => sum + item.quantity, 0)
  const single = kind.max_per_build === 1
  const full = count >= kind.max_per_build
  const chooseLabel = items.length === 0 ? 'Choose' : single ? 'Change' : 'Add another'

  return (
    <li
      className={clsx(
        'rounded-[var(--radius-card)] border bg-surface p-4',
        missing ? 'border-dashed border-border-strong' : 'border-border',
      )}
    >
      <div className="flex items-center gap-3">
        <span className="rounded-md bg-accent-soft p-2 text-accent">
          <KindIcon kind={kind.code} />
        </span>
        <div className="flex-1">
          <h2 className="text-sm font-semibold">{kind.label}</h2>
          <p className="text-xs text-ink-subtle">
            {kind.required_in_build ? 'Required' : 'Optional'}
            {single ? '' : `, up to ${String(kind.max_per_build)}`}
          </p>
        </div>
        {editable ? (
          <Button
            variant={items.length ? 'secondary' : 'primary'}
            disabled={!single && full}
            onClick={onChoose}
            aria-label={`${chooseLabel} ${inSentence(kind.label)}`}
          >
            {chooseLabel}
          </Button>
        ) : null}
      </div>

      {items.length ? (
        <ul className="mt-3 space-y-2">
          {items.map(({ product, quantity, withdrawn }) => {
            const conflict = conflictIds.has(product.id)
            return (
              <li
                key={product.id}
                className={clsx(
                  'flex flex-wrap items-center gap-3 rounded-md border px-3 py-2',
                  conflict || withdrawn ? 'border-danger/40 bg-danger-soft' : 'border-border',
                )}
              >
                <div className="min-w-0 flex-1">
                  <Link to={`/products/${product.slug}`} className="text-sm font-medium hover:text-accent">
                    {product.name}
                  </Link>
                  {withdrawn ? (
                    <p className="text-xs text-danger">No longer sold. Remove it or choose another.</p>
                  ) : !product.availability.in_stock ? (
                    <p className="text-xs text-danger">Out of stock</p>
                  ) : conflict ? (
                    <p className="text-xs text-danger">Conflicts with another part</p>
                  ) : null}
                </div>
                {!single && editable ? (
                  <div
                    className="flex items-center gap-1"
                    role="group"
                    aria-label={`Quantity of ${product.name}`}
                  >
                    <Button
                      variant="ghost"
                      className="px-2"
                      aria-label="Decrease quantity"
                      onClick={() => {
                        onQuantity(product.id, quantity - 1)
                      }}
                    >
                      <Minus aria-hidden="true" className="h-4 w-4" />
                    </Button>
                    <span className="w-6 text-center text-sm tabular" aria-live="polite">
                      {quantity}
                    </span>
                    <Button
                      variant="ghost"
                      className="px-2"
                      aria-label="Increase quantity"
                      disabled={full}
                      onClick={() => {
                        onQuantity(product.id, quantity + 1)
                      }}
                    >
                      <Plus aria-hidden="true" className="h-4 w-4" />
                    </Button>
                  </div>
                ) : quantity > 1 ? (
                  <span className="text-sm text-ink-muted tabular">x {quantity}</span>
                ) : null}
                <span className="w-28 text-right text-sm font-medium tabular">
                  {formatCents(product.price.amount_cents * quantity)}
                </span>
                {editable ? (
                  <Button
                    variant="ghost"
                    className="px-2"
                    aria-label={`Remove ${product.name}`}
                    onClick={() => {
                      onRemove(product.id)
                    }}
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
    </li>
  )
}
