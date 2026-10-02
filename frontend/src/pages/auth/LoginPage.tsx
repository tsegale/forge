import { useState, type SyntheticEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ApiError } from '@/api/errors'
import { useAuth } from '@/auth/context'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { Field } from '@/components/ui/Field'
import { safeNext } from '@/lib/navigation'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
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
      void navigate(safeNext(params.get('next')), { replace: true })
    } catch (caught) {
      setError(caught)
    } finally {
      setBusy(false)
    }
  }

  const fields = error instanceof ApiError ? error.fieldErrors() : {}
  return (
    <section className="mx-auto max-w-sm">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-1 text-sm text-ink-muted">
        New to Forge?{' '}
        <Link to="/register" className="font-medium text-accent hover:text-accent-hover">
          Create an account
        </Link>
      </p>
      <form onSubmit={(e) => void submit(e)} className="mt-6 flex flex-col gap-4" noValidate>
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
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
          }}
          error={fields.password}
        />
        <Button type="submit" busy={busy}>
          {busy ? 'Signing in' : 'Sign in'}
        </Button>
      </form>
    </section>
  )
}
