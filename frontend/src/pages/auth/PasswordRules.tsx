import { Check, Circle } from 'lucide-react'

export const MIN_PASSWORD = 12

/**
 * The password policy, checked as the customer types. Length is the rule (NIST SP 800-63B): no
 * composition requirements, and a passphrase is encouraged.
 */
export function PasswordRules({ password }: { password: string }) {
  const long = password.length >= MIN_PASSWORD
  return (
    <span className="flex flex-col gap-0.5">
      <span className={long ? 'flex items-center gap-1.5 text-success-ink' : 'flex items-center gap-1.5'}>
        {long ? (
          <Check aria-hidden="true" className="h-3.5 w-3.5" />
        ) : (
          <Circle aria-hidden="true" className="h-3.5 w-3.5" />
        )}
        At least {MIN_PASSWORD} characters{long ? '' : ` (${String(password.length)} so far)`}
      </span>
      <span>A phrase of a few unrelated words is strong and easy to remember.</span>
    </span>
  )
}
