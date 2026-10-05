import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ApiError } from '@/api/errors'
import { ADMIN_PRODUCTS_KEY, getInventory, updateStock, type AdminProductRow } from '@/admin/api'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { Field } from '@/components/ui/Field'

interface Snapshot {
  onHand: number
  reserved: number
  version: number
}

/**
 * Edit stock on hand with optimistic concurrency. The save carries the version this dialog was
 * opened with; if anyone (another admin, or a checkout reserving stock) changed it since, the API
 * answers 412 and nothing is written. The admin then sees the new figures and decides again.
 */
export function StockDialog({ product, onClose }: { product: AdminProductRow; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [base, setBase] = useState<Snapshot>({
    onHand: product.quantity_on_hand,
    reserved: product.quantity_reserved,
    version: product.version,
  })
  const [value, setValue] = useState(String(product.quantity_on_hand))
  const [stale, setStale] = useState<Snapshot | null>(null)
  const parsed = /^\d+$/.test(value.trim()) ? Number(value.trim()) : null

  const refreshList = () => queryClient.invalidateQueries({ queryKey: ADMIN_PRODUCTS_KEY })
  const save = useMutation({
    mutationFn: (quantity: number) => updateStock(product.id, quantity, base.version),
    onSuccess: () => {
      void refreshList()
      onClose()
    },
    onError: async (error) => {
      if (!(error instanceof ApiError && error.status === 412)) return
      void refreshList()
      try {
        const latest = await getInventory(product.id)
        setStale({
          onHand: latest.quantity_on_hand,
          reserved: latest.quantity_reserved,
          version: latest.version,
        })
      } catch {
        // The 412 message stays on screen; closing and reopening the dialog reads afresh.
      }
    },
  })

  const reload = () => {
    if (!stale) return
    setBase(stale)
    setValue(String(stale.onHand))
    setStale(null)
    save.reset()
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={`Stock for ${product.name}`}
      description={`SKU ${product.sku}`}
    >
      {stale ? (
        <div className="space-y-4">
          <Alert tone="warning" title="Stock changed, reload">
            Someone changed this product&apos;s stock while you were editing, so your change was not saved. It
            now has {stale.onHand} on hand, {stale.reserved} reserved by checkouts.
          </Alert>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button onClick={reload}>Reload and edit again</Button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (parsed !== null) save.mutate(parsed)
          }}
        >
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-ink-muted">On hand</dt>
              <dd className="font-medium tabular">{base.onHand}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Reserved</dt>
              <dd className="font-medium tabular">{base.reserved}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Available</dt>
              <dd className="font-medium tabular">{base.onHand - base.reserved}</dd>
            </div>
          </dl>
          <Field
            label="New stock on hand"
            inputMode="numeric"
            value={value}
            onChange={(event) => {
              setValue(event.target.value)
            }}
            error={
              value.trim() && parsed === null
                ? 'Enter a whole number of units.'
                : parsed !== null && parsed < base.reserved
                  ? `At least ${String(base.reserved)}: that many are reserved by checkouts.`
                  : undefined
            }
            hint="Units physically in the warehouse, including those reserved."
          />
          <ErrorMessage error={save.error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              busy={save.isPending}
              disabled={parsed === null || parsed < base.reserved || parsed === base.onHand}
            >
              Save stock
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  )
}
