import { api, unwrap } from '@/api/client'

/** Ask for a reset link. The API answers the same for every address (no account enumeration). */
export async function requestPasswordReset(email: string): Promise<string> {
  return (await unwrap(api.POST('/api/v1/auth/password-reset', { body: { email } }))).message
}

export async function confirmPasswordReset(token: string, password: string): Promise<void> {
  await unwrap(api.POST('/api/v1/auth/password-reset/confirm', { body: { token, password } }))
}

/** The token from the emailed link's fragment (#token=...), which never reaches a server log. */
export function tokenFromHash(hash: string): string | null {
  const token = new URLSearchParams(hash.replace(/^#/, '')).get('token')
  return token && /^[A-Za-z0-9_-]{20,200}$/.test(token) ? token : null
}
