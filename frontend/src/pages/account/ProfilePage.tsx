import { useMutation } from '@tanstack/react-query'
import { useState, type SyntheticEvent } from 'react'
import { useNavigate } from 'react-router'
import { changePassword, updateProfile } from '@/account/api'
import { ApiError } from '@/api/errors'
import { useAuth } from '@/auth/context'
import { logoutEverywhere } from '@/auth/session'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { Field } from '@/components/ui/Field'
import { PasswordField } from '@/components/ui/PasswordField'
import { toast } from '@/components/ui/toastStore'
import { usePageTitle } from '@/lib/usePageTitle'
import { MIN_PASSWORD, PasswordRules } from '@/pages/auth/PasswordRules'

function Card({
  id,
  title,
  description,
  children,
}: {
  id: string
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section aria-labelledby={id} className="rounded-md border border-border bg-surface p-5 sm:p-6">
      <h2 id={id} className="text-lg font-semibold text-ink">
        {title}
      </h2>
      <p className="mt-1 text-sm text-ink-muted">{description}</p>
      <div className="mt-5">{children}</div>
    </section>
  )
}

function NameForm() {
  const { user, replaceUser } = useAuth()
  const [first, setFirst] = useState(user?.first_name ?? '')
  const [last, setLast] = useState(user?.last_name ?? '')
  const save = useMutation({
    mutationFn: () => updateProfile({ first_name: first, last_name: last }),
    onSuccess: (updated) => {
      replaceUser(updated)
      toast({ title: 'Name saved' })
    },
  })
  const errors = save.error instanceof ApiError ? save.error.fieldErrors() : {}
  const submit = (event: SyntheticEvent) => {
    event.preventDefault()
    save.mutate()
  }
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {save.error && !Object.keys(errors).length ? <ErrorMessage error={save.error} /> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="First name"
          autoComplete="given-name"
          value={first}
          error={errors.first_name}
          onChange={(e) => {
            setFirst(e.target.value)
          }}
        />
        <Field
          label="Last name"
          autoComplete="family-name"
          value={last}
          error={errors.last_name}
          onChange={(e) => {
            setLast(e.target.value)
          }}
        />
      </div>
      <Field
        label="Email"
        value={user?.email ?? ''}
        readOnly
        disabled
        hint="Your email address is your sign-in, so it cannot be changed here."
      />
      <Button type="submit" variant="secondary" className="self-start" busy={save.isPending}>
        Save name
      </Button>
    </form>
  )
}

function PasswordForm() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [problem, setProblem] = useState<string | undefined>()
  const save = useMutation({
    mutationFn: () => changePassword({ current_password: current, new_password: next }),
    onSuccess: () => {
      setCurrent('')
      setNext('')
      toast({ title: 'Password changed', description: 'Other devices have been signed out.' })
    },
  })
  const wrong = save.error instanceof ApiError && save.error.code === 'wrong_password'
  const submit = (event: SyntheticEvent) => {
    event.preventDefault()
    if (next.length < MIN_PASSWORD) {
      setProblem(`Use at least ${String(MIN_PASSWORD)} characters.`)
      return
    }
    setProblem(undefined)
    save.mutate()
  }
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {save.error && !wrong ? <ErrorMessage error={save.error} /> : null}
      <PasswordField
        label="Current password"
        autoComplete="current-password"
        value={current}
        error={wrong ? 'That is not your current password.' : undefined}
        onChange={(e) => {
          setCurrent(e.target.value)
        }}
      />
      <PasswordField
        label="New password"
        autoComplete="new-password"
        value={next}
        error={problem}
        hint={<PasswordRules password={next} />}
        onChange={(e) => {
          setNext(e.target.value)
        }}
      />
      <Button type="submit" variant="secondary" className="self-start" busy={save.isPending}>
        Change password
      </Button>
    </form>
  )
}

function Sessions() {
  const navigate = useNavigate()
  const [confirm, setConfirm] = useState(false)
  const out = useMutation({
    mutationFn: logoutEverywhere,
    onSuccess: () => {
      void navigate('/login', { replace: true })
    },
  })
  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setConfirm(true)
        }}
      >
        Sign out on every device
      </Button>
      <ErrorMessage error={out.error} />
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Sign out everywhere?"
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setConfirm(false)
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              busy={out.isPending}
              onClick={() => {
                out.mutate()
              }}
            >
              Sign out everywhere
            </Button>
          </div>
        }
      >
        <p className="text-base text-ink-muted">
          Every browser and device, including this one, will need to sign in again. Your cart and builds are
          kept.
        </p>
      </Dialog>
    </>
  )
}

/** Name, password and sessions. */
export function ProfilePage() {
  usePageTitle('Profile and security')
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Profile and security</h1>
      <Card id="name-heading" title="Your name" description="How we address you in emails and on orders.">
        <NameForm />
      </Card>
      <Card
        id="password-heading"
        title="Password"
        description="Changing it signs out your other devices. This one stays signed in."
      >
        <PasswordForm />
      </Card>
      <Card
        id="sessions-heading"
        title="Sessions"
        description="Lost a device, or signed in on a shared computer? End every session at once."
      >
        <Sessions />
      </Card>
    </div>
  )
}
