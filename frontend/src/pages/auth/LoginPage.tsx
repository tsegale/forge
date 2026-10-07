import { useState, type SyntheticEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { ApiError } from '@/api/errors'
import { useAuth } from '@/auth/context'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { Alert } from '@/components/ui/Alert'
import { Field } from '@/components/ui/Field'
import { PasswordField } from '@/components/ui/PasswordField'
import { safeNext } from '@/lib/navigation'
import { usePageTitle } from '@/lib/usePageTitle'
import { AuthLayout } from './AuthLayout'

export function LoginPage() {
  usePageTitle('Sign in')
  const reset = (useLocation().state as { passwordReset?: boolean } | null)?.passwordReset === true
  const { login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: SyntheticEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(email, password)
      void navigate(safeNext(next), { replace: true })
    } catch (caught) {
      setError(caught)
    } finally {
      setBusy(false)
    }
  }

  const fields = error instanceof ApiError ? error.fieldErrors() : {}
  const registerHref = next ? `/register?next=${encodeURIComponent(next)}` : '/register'
  return (
    <AuthLayout
      title="Sign in"
      intro={
        <>
          New to Forge?{' '}
          <Link to={registerHref} className="font-medium text-accent hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-5" noValidate>
        {reset ? (
          <Alert tone="success" title="Password changed">
            Every device was signed out. Sign in with your new password.
          </Alert>
        ) : null}
        {error && !Object.keys(fields).length ? <ErrorMessage error={error} /> : null}
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
          }}
          error={fields.email}
        />
        <div className="flex flex-col gap-1.5">
          <PasswordField
            label="Password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
            }}
            error={fields.password}
          />
          <Link to="/forgot-password" className="self-end text-sm font-medium text-accent hover:underline">
            Forgot your password?
          </Link>
        </div>
        <Button type="submit" size="lg" busy={busy}>
          {busy ? 'Signing in' : 'Sign in'}
        </Button>
      </form>
    </AuthLayout>
  )
}
