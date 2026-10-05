import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ADMIN_PRODUCTS_KEY, updateProduct, type AdminProductRow } from '@/admin/api'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { Field } from '@/components/ui/Field'
import { centsToInput, formatCents, parseCents } from '@/lib/money'

/**
 * Edit a product's price (VAT included) and whether it is sold. Only changed fields are sent;
 * price changes are recorded in price_history by a database trigger. Orders already placed keep
 * the price they were charged.
 */
export function ProductDialog({ product, onClose }: { product: AdminProductRow; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [price, setPrice] = useState(centsToInput(product.price_cents))
  const [active, setActive] = useState(product.is_active)
  const cents = parseCents(price)
  const changes = {
    ...(cents !== null && cents !== product.price_cents ? { price_cents: cents } : {}),
    ...(active !== product.is_active ? { is_active: active } : {}),
  }
  const save = useMutation({
    mutationFn: () => updateProduct(product.id, changes),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ADMIN_PRODUCTS_KEY })
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      void queryClient.invalidateQueries({ queryKey: ['product'] })
      onClose()
    },
  })

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={`Edit ${product.name}`}
      description={`SKU ${product.sku}`}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (cents !== null) save.mutate()
        }}
      >
        <Field
          label="Price in N$ (VAT included)"
          inputMode="decimal"
          value={price}
          onChange={(event) => {
            setPrice(event.target.value)
          }}
          error={cents === null ? 'Enter an amount such as 2299.00.' : undefined}
          hint={`Currently ${formatCents(product.price_cents)}.`}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={active}
            onChange={(event) => {
              setActive(event.target.checked)
            }}
          />
          On sale (shown in the catalog and can be ordered)
        </label>
        <ErrorMessage error={save.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            busy={save.isPending}
            disabled={cents === null || Object.keys(changes).length === 0}
          >
            Save product
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
