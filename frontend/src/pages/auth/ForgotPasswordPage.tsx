import { useMutation } from '@tanstack/react-query'
import { MailCheck } from 'lucide-react'
import { useState, type SyntheticEvent } from 'react'
import { Link } from 'react-router'
import { ApiError } from '@/api/errors'
import { requestPasswordReset } from '@/auth/passwordReset'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { Field } from '@/components/ui/Field'
import { usePageTitle } from '@/lib/usePageTitle'
import { AuthLayout } from './AuthLayout'

/** Ask for a reset link. The confirmation reads the same whether or not the address has an account. */
export function ForgotPasswordPage() {
  usePageTitle('Reset your password')
  const [email, setEmail] = useState('')
  const send = useMutation({ mutationFn: requestPasswordReset })
  const fields = send.error instanceof ApiError ? send.error.fieldErrors() : {}

  if (send.isSuccess) {
    return (
      <AuthLayout title="Check your email">
        <div className="flex flex-col gap-5" role="status">
          <MailCheck aria-hidden="true" className="h-10 w-10 text-accent" strokeWidth={1.75} />
          <p className="text-base text-ink">{send.data}</p>
          <p className="text-sm text-ink-muted">
            Nothing arrived? Check your spam folder, or{' '}
            <button
              type="button"
              className="font-medium text-accent hover:underline"
              onClick={() => {
                send.reset()
              }}
            >
              try another address
            </button>
            .
          </p>
          <Link to="/login" className="text-sm font-medium text-accent hover:underline">
            Back to sign in
          </Link>
        </div>
      </AuthLayout>
    )
  }

  const submit = (event: SyntheticEvent) => {
    event.preventDefault()
    send.mutate(email.trim())
  }
  return (
    <AuthLayout
      title="Reset your password"
      intro="Enter the email address you shop with and we will send you a link to choose a new password."
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        {send.error && !Object.keys(fields).length ? <ErrorMessage error={send.error} /> : null}
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          error={fields.email}
          onChange={(event) => {
            setEmail(event.target.value)
          }}
        />
        <Button type="submit" size="lg" busy={send.isPending}>
          {send.isPending ? 'Sending link' : 'Send reset link'}
        </Button>
        <Link to="/login" className="text-sm font-medium text-accent hover:underline">
          Back to sign in
        </Link>
      </form>
    </AuthLayout>
  )
}
