import { Bell, BellRing } from 'lucide-react'
import { useState, type SyntheticEvent } from 'react'
import { Link, useLocation } from 'react-router'
import { useAlerts, useDeleteAlert, useSetAlert } from '@/account/api'
import { ApiError } from '@/api/errors'
import { useAuth } from '@/auth/context'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { Field } from '@/components/ui/Field'
import { toast } from '@/components/ui/toastStore'
import { centsToInput, formatCents, parseCents } from '@/lib/money'

/** "Notify me when the price drops": name a price below today's, get one email when it is reached. */
export function PriceAlertControl({
  productId,
  productName,
  priceCents,
}: {
  productId: number
  productName: string
  priceCents: number
}) {
  const { user } = useAuth()
  const location = useLocation()
  const alerts = useAlerts()
  const existing = alerts.data?.items.find((a) => a.product.id === productId)
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [problem, setProblem] = useState<string | undefined>()
  const save = useSetAlert()
  const remove = useDeleteAlert()

  if (!user) {
    return (
      <Link
        to={`/login?next=${encodeURIComponent(location.pathname)}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
      >
        <Bell aria-hidden="true" className="h-4 w-4" /> Sign in to get a price-drop alert
      </Link>
    )
  }

  const suggestion = Math.round((priceCents * 0.9) / 10_000) * 10_000 - 100
  const serverError = save.error instanceof ApiError ? Object.values(save.error.fieldErrors())[0] : undefined
  const submit = (event: SyntheticEvent) => {
    event.preventDefault()
    const cents = parseCents(value)
    if (cents === null || cents <= 0) {
      setProblem('Enter an amount such as 6,999 or 6999.00.')
      return
    }
    if (cents >= priceCents) {
      setProblem(`Choose a price below today's ${formatCents(priceCents)}.`)
      return
    }
    setProblem(undefined)
    save.mutate(
      { product_id: productId, target_price_cents: cents },
      {
        onSuccess: () => {
          setOpen(false)
          toast({
            title: 'Price alert set',
            description: `We will email you at ${formatCents(cents)} or less.`,
          })
        },
      },
    )
  }

  return (
    <>
      {existing?.triggered_at === null ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
          <span className="inline-flex items-center gap-1.5">
            <BellRing aria-hidden="true" className="h-4 w-4 text-accent" />
            Watching for {formatCents(existing.target.amount_cents)} or less
          </span>
          <button
            type="button"
            className="font-medium text-accent hover:underline"
            onClick={() => {
              setValue(centsToInput(existing.target.amount_cents))
              setOpen(true)
            }}
          >
            Change
          </button>
          <button
            type="button"
            className="font-medium text-ink-muted hover:underline"
            onClick={() => {
              remove.mutate(existing.id)
            }}
          >
            Stop
          </button>
        </p>
      ) : (
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
          onClick={() => {
            setValue(suggestion > 0 ? centsToInput(suggestion) : '')
            setOpen(true)
          }}
        >
          <Bell aria-hidden="true" className="h-4 w-4" /> Notify me when the price drops
        </button>
      )}
      <Dialog open={open} onOpenChange={setOpen} title="Price-drop alert" description={productName} size="sm">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Field
            label="Email me when the price is at or below (N$)"
            inputMode="decimal"
            value={value}
            error={problem ?? serverError}
            hint={`Today: ${formatCents(priceCents)}. One email, when it is reached.`}
            onChange={(event) => {
              setValue(event.target.value)
            }}
          />
          {save.error && !serverError ? <ErrorMessage error={save.error} /> : null}
          <Button type="submit" busy={save.isPending}>
            Set alert
          </Button>
        </form>
      </Dialog>
    </>
  )
}
