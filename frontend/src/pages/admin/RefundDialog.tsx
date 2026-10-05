import { useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { formatPrice } from '@/lib/money'

const MAX_REASON = 500

/** Confirm a full refund. Money moves only after this confirmation, with an optional reason. */
export function RefundDialog({
  open,
  onOpenChange,
  orderNumber,
  customerEmail,
  total,
  busy,
  error,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderNumber: string
  customerEmail: string
  total: { amount_cents: number; currency: string }
  busy: boolean
  error: unknown
  onConfirm: (reason: string | null) => void
}) {
  const [reason, setReason] = useState('')
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Refund order ${orderNumber}?`}
      description={`${formatPrice(total)} goes back to ${customerEmail}'s card through Stripe.`}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          onConfirm(reason.trim() || null)
        }}
      >
        <Alert tone="warning" title="This cannot be undone">
          The full amount is refunded and the order is marked refunded.
        </Alert>
        <label className="block text-sm">
          <span className="font-medium">Reason (optional, kept in the payment log)</span>
          <textarea
            value={reason}
            maxLength={MAX_REASON}
            rows={3}
            onChange={(event) => {
              setReason(event.target.value)
            }}
            className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2"
          />
          <span className="text-xs text-ink-subtle">
            {reason.length} / {MAX_REASON}
          </span>
        </label>
        <ErrorMessage error={error} />
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              onOpenChange(false)
            }}
          >
            Keep the payment
          </Button>
          <Button type="submit" variant="danger" busy={busy}>
            Refund {formatPrice(total)}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
