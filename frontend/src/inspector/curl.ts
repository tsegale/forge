import type { ApiCall } from './store'

/** The call as a curl command (no Authorization: sign in again or add a token yourself). */
export function curlFor(call: ApiCall, origin: string): string {
  const parts = [`curl -i -X ${call.method} '${origin}${call.path}'`]
  if (call.requestBody) {
    parts.push(`-H 'Content-Type: application/json'`, `--data '${call.requestBody.replaceAll("'", "'\\''")}'`)
  }
  return parts.join(' \\\n  ')
}
