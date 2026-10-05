import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ApiError } from '@/api/errors'
import {
  ADMIN_ORDERS_KEY,
  adminOrderQuery,
  advanceOrder,
  refundOrder,
  type FulfilmentStep,
} from '@/admin/api'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { RefundDialog } from './RefundDialog'

const STEP_ACTIONS: Record<FulfilmentStep, string> = {
  fulfilling: 'Start fulfilment',
  shipped: 'Mark shipped',
  delivered: 'Mark delivered',
}

interface ActionableOrder {
  order_number: string
  customer_email: string
  next_steps: FulfilmentStep[]
  refundable: boolean
  total: { amount_cents: number; currency: string }
}

/**
 * The legal next actions for an order, exactly as the API lists them (the database state
 * machine decides). If another admin moved the order first, the conflict refreshes it.
 */
export function OrderActions({ order, compact = false }: { order: ActionableOrder; compact?: boolean }) {
  const queryClient = useQueryClient()
  const [refunding, setRefunding] = useState(false)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ADMIN_ORDERS_KEY })

  const onDone = (updated: Awaited<ReturnType<typeof advanceOrder>>) => {
    queryClient.setQueryData(adminOrderQuery(updated.order_number).queryKey, updated)
    void refresh()
  }
  const onFail = (error: Error) => {
    if (error instanceof ApiError && error.status === 409) void refresh()
  }
  const advance = useMutation({
    mutationFn: (to: FulfilmentStep) => advanceOrder(order.order_number, to),
    onSuccess: onDone,
    onError: onFail,
  })
  const refund = useMutation({
    mutationFn: (reason: string | null) => refundOrder(order.order_number, reason),
    onSuccess: (updated) => {
      onDone(updated)
      setRefunding(false)
    },
    onError: onFail,
  })

  if (!order.next_steps.length && !order.refundable) {
    return compact ? null : <p className="text-sm text-ink-muted">No further actions.</p>
  }
  return (
    <div className={compact ? 'flex flex-wrap justify-end gap-2' : 'space-y-3'}>
      <div className="flex flex-wrap gap-2">
        {order.next_steps.map((step) => (
          <Button
            key={step}
            busy={advance.isPending && advance.variables === step}
            disabled={advance.isPending}
            aria-label={compact ? `${STEP_ACTIONS[step]} for ${order.order_number}` : undefined}
            onClick={() => {
              advance.mutate(step)
            }}
          >
            {STEP_ACTIONS[step]}
          </Button>
        ))}
        {order.refundable ? (
          <Button
            variant="secondary"
            aria-label={compact ? `Refund ${order.order_number}` : undefined}
            onClick={() => {
              refund.reset()
              setRefunding(true)
            }}
          >
            Refund
          </Button>
        ) : null}
      </div>
      <ErrorMessage error={advance.error} />
      <RefundDialog
        open={refunding}
        onOpenChange={setRefunding}
        orderNumber={order.order_number}
        customerEmail={order.customer_email}
        total={order.total}
        busy={refund.isPending}
        error={refund.error}
        onConfirm={(reason) => {
          refund.mutate(reason)
        }}
      />
    </div>
  )
}
