import { Minus, Plus, Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import type { components } from '@/api/schema'
import type { FreshItem } from '@/builds/useFreshItems'
import { KindIcon } from '@/catalog/kinds'
import { inSentence } from '@/catalog/labels'
import { keySpecs } from '@/catalog/specs'
import { ProductImage } from '@/components/catalog/ProductImage'
import { Badge } from '@/components/ui/Badge'
import { Button, IconButton } from '@/components/ui/Button'
import { StockIndicator } from '@/components/ui/StockIndicator'
import { cn } from '@/lib/cn'
import { formatCents } from '@/lib/money'
import { FindingItem, type Finding } from './FindingItem'

type ComponentKind = components['schemas']['ComponentKindResponse']

/**
 * One component kind in the build: the parts chosen for it, each with the findings that involve
 * it (measured values included), or an empty slot that says what goes there.
 */
export function KindSlot({
  kind,
  items,
  findingsFor,
  missing,
  editable,
  onChoose,
  onQuantity,
  onRemove,
}: {
  kind: ComponentKind
  items: FreshItem[]
  findingsFor: (productId: number) => Finding[]
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
  const label = inSentence(kind.label)
  const headingId = `slot-${kind.code}`
  const hasConflict = items.some((item) =>
    findingsFor(item.product.id).some((f) => f.severity === 'conflict'),
  )

  return (
    <li>
      <section
        aria-labelledby={headingId}
        className={cn(
          'rounded-md border bg-surface',
          hasConflict ? 'border-danger/50' : missing ? 'border-dashed border-border-strong' : 'border-border',
        )}
      >
        <header className="flex items-center gap-3 px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-surface-muted text-ink-muted">
            <KindIcon kind={kind.code} className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={headingId} className="text-base font-semibold text-ink">
              {kind.label}
            </h2>
            <p className="text-sm text-ink-subtle">
              {single ? 'One' : `Up to ${String(kind.max_per_build)}`}
              {!single && count ? `, ${String(count)} chosen` : ''}
            </p>
          </div>
          {missing ? <Badge tone="warning">Required</Badge> : null}
          {editable && items.length ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={!single && full}
              onClick={onChoose}
              aria-label={`${chooseLabel} ${label}`}
            >
              {chooseLabel}
            </Button>
          ) : null}
        </header>

        {items.length ? (
          <ul className="border-t border-border">
            {items.map(({ product, quantity, withdrawn }) => {
              const findings = findingsFor(product.id)
              return (
                <li key={product.id} className="border-b border-border px-4 py-3 last:border-0">
                  <div className="grid grid-cols-[4.5rem_1fr] gap-x-4 gap-y-2 sm:grid-cols-[5.5rem_1fr_auto]">
                    <ProductImage
                      image={product.image}
                      kind={product.kind}
                      name={product.name}
                      variant="thumb"
                      className="rounded-sm border border-border"
                    />
                    <div className="min-w-0">
                      <Link
                        to={`/products/${product.slug}`}
                        className="text-base leading-snug font-medium text-ink hover:text-accent"
                      >
                        {product.name}
                      </Link>
                      <p className="mt-0.5 truncate font-tech text-xs text-ink-muted">
                        {keySpecs(product.specs).join(' / ')}
                      </p>
                      <div className="mt-1">
                        {withdrawn ? (
                          <p className="text-sm text-danger-ink">
                            No longer sold. Remove it or choose another.
                          </p>
                        ) : (
                          <StockIndicator availability={product.availability} />
                        )}
                      </div>
                    </div>
                    <div className="col-span-2 flex items-center justify-between gap-3 sm:col-span-1 sm:flex-col sm:items-end sm:justify-start">
                      <span className="text-base font-semibold text-ink tabular">
                        {formatCents(product.price.amount_cents * quantity)}
                      </span>
                      {editable ? (
                        <div className="flex items-center gap-1">
                          {!single ? (
                            <div
                              className="flex items-center rounded-sm border border-control"
                              role="group"
                              aria-label={`Quantity of ${product.name}`}
                            >
                              <IconButton
                                label="Decrease quantity"
                                size="sm"
                                onClick={() => {
                                  onQuantity(product.id, quantity - 1)
                                }}
                              >
                                <Minus aria-hidden="true" className="h-3.5 w-3.5" />
                              </IconButton>
                              <span className="w-6 text-center text-sm tabular" aria-live="polite">
                                {quantity}
                              </span>
                              <IconButton
                                label="Increase quantity"
                                size="sm"
                                disabled={full}
                                onClick={() => {
                                  onQuantity(product.id, quantity + 1)
                                }}
                              >
                                <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                              </IconButton>
                            </div>
                          ) : null}
                          <IconButton
                            label={`Remove ${product.name}`}
                            size="sm"
                            onClick={() => {
                              onRemove(product.id)
                            }}
                          >
                            <Trash2 aria-hidden="true" className="h-4 w-4" />
                          </IconButton>
                        </div>
                      ) : quantity > 1 ? (
                        <span className="text-sm text-ink-muted tabular">x {quantity}</span>
                      ) : null}
                    </div>
                  </div>
                  {findings.length ? (
                    <ul className="mt-3 flex flex-col gap-2" aria-label={`Findings for ${product.name}`}>
                      {findings.map((finding) => (
                        <li key={`${finding.code}-${finding.product_ids.join('-')}`}>
                          <FindingItem finding={finding} />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              )
            })}
          </ul>
        ) : editable ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-border px-4 py-3">
            <p className="text-sm text-ink-muted">
              {kind.required_in_build
                ? `Every build needs a ${label}.`
                : `Optional. Add a ${label} if you need one.`}
            </p>
            <Button
              size="sm"
              variant={kind.required_in_build ? 'primary' : 'secondary'}
              onClick={onChoose}
              aria-label={`${chooseLabel} ${label}`}
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              {chooseLabel}
            </Button>
          </div>
        ) : null}
      </section>
    </li>
  )
}
