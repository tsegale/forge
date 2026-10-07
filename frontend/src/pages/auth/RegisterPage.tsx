import { useState, type SyntheticEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ApiError } from '@/api/errors'
import { useAuth } from '@/auth/context'
import { register } from '@/auth/session'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { Field } from '@/components/ui/Field'
import { PasswordField } from '@/components/ui/PasswordField'
import { safeNext } from '@/lib/navigation'
import { usePageTitle } from '@/lib/usePageTitle'
import { AuthLayout } from './AuthLayout'
import { PasswordRules } from './PasswordRules'

export function RegisterPage() {
  usePageTitle('Create an account')
  const { login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next')
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', password: '' })
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: SyntheticEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await register(form)
      await login(form.email, form.password)
      void navigate(safeNext(next), { replace: true })
    } catch (caught) {
      setError(caught)
    } finally {
      setBusy(false)
    }
  }

  const fields = error instanceof ApiError ? error.fieldErrors() : {}
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => {
    setForm({ ...form, [key]: e.target.value })
  }
  return (
    <AuthLayout
      title="Create an account"
      intro={
        <>
          Already registered?{' '}
          <Link
            to={next ? `/login?next=${encodeURIComponent(next)}` : '/login'}
            className="font-medium text-accent hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-5" noValidate>
        {error && !Object.keys(fields).length ? <ErrorMessage error={error} /> : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="First name"
            autoComplete="given-name"
            required
            value={form.first_name}
            onChange={set('first_name')}
            error={fields.first_name}
          />
          <Field
            label="Last name"
            autoComplete="family-name"
            required
            value={form.last_name}
            onChange={set('last_name')}
            error={fields.last_name}
          />
        </div>
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={set('email')}
          error={fields.email}
        />
        <PasswordField
          label="Password"
          autoComplete="new-password"
          required
          minLength={12}
          value={form.password}
          onChange={set('password')}
          error={fields.password}
          hint={<PasswordRules password={form.password} />}
        />
        <Button type="submit" size="lg" busy={busy}>
          {busy ? 'Creating account' : 'Create account'}
        </Button>
      </form>
    </AuthLayout>
  )
}
