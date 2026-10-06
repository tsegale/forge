import { useMutation } from '@tanstack/react-query'
import { useState, type SyntheticEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { ApiError } from '@/api/errors'
import { confirmPasswordReset, tokenFromHash } from '@/auth/passwordReset'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { PasswordField } from '@/components/ui/PasswordField'
import { usePageTitle } from '@/lib/usePageTitle'
import { AuthLayout } from './AuthLayout'
import { MIN_PASSWORD, PasswordRules } from './PasswordRules'

/** Read the token once and take it out of the address bar, so it is not left in history. */
function takeToken(): string | null {
  const token = tokenFromHash(globalThis.location.hash)
  if (globalThis.location.hash) {
    globalThis.history.replaceState(globalThis.history.state, '', globalThis.location.pathname)
  }
  return token
}

/** Choose a new password from the emailed link (#token=...). */
export function ResetPasswordPage() {
  usePageTitle('Choose a new password')
  const navigate = useNavigate()
  const [token] = useState(takeToken)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [problem, setProblem] = useState<{ field: 'password' | 'confirm'; message: string } | null>(null)
  const save = useMutation({
    mutationFn: () => confirmPasswordReset(token ?? '', password),
    onSuccess: () => {
      void navigate('/login', { replace: true, state: { passwordReset: true } })
    },
  })

  const expired = save.error instanceof ApiError && save.error.code === 'invalid_reset_token'
  if (!token || expired) {
    return (
      <AuthLayout title={expired ? 'This link has expired' : 'This link is not valid'}>
        <div className="flex flex-col gap-5">
          <Alert tone="warning" title="Ask for a new link">
            Reset links work once and expire after a short time. Your password has not changed.
          </Alert>
          <Button asChild size="lg">
            <Link to="/forgot-password">Send a new link</Link>
          </Button>
        </div>
      </AuthLayout>
    )
  }

  const fields = save.error instanceof ApiError ? save.error.fieldErrors() : {}
  const submit = (event: SyntheticEvent) => {
    event.preventDefault()
    if (password.length < MIN_PASSWORD) {
      setProblem({ field: 'password', message: `Use at least ${String(MIN_PASSWORD)} characters.` })
      return
    }
    if (confirm !== password) {
      setProblem({ field: 'confirm', message: 'The two passwords do not match.' })
      return
    }
    setProblem(null)
    save.mutate()
  }
  return (
    <AuthLayout
      title="Choose a new password"
      intro="Every device signed in to your account will be signed out."
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        {save.error && !Object.keys(fields).length ? <ErrorMessage error={save.error} /> : null}
        <PasswordField
          label="New password"
          autoComplete="new-password"
          required
          value={password}
          error={problem?.field === 'password' ? problem.message : fields.password}
          hint={<PasswordRules password={password} />}
          onChange={(event) => {
            setPassword(event.target.value)
          }}
        />
        <PasswordField
          label="Confirm new password"
          autoComplete="new-password"
          required
          value={confirm}
          error={problem?.field === 'confirm' ? problem.message : undefined}
          onChange={(event) => {
            setConfirm(event.target.value)
          }}
        />
        <Button type="submit" size="lg" busy={save.isPending}>
          {save.isPending ? 'Saving' : 'Set new password'}
        </Button>
      </form>
    </AuthLayout>
  )
}
