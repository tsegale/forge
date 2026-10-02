/**
 * The backend answers every failure with one envelope:
 *   {"error": {"code", "message", "details", "request_id"}}
 * ApiError carries it into the UI. `code` is stable and safe to branch on; `requestId` is shown in
 * error messages so a problem can be traced in the server logs.
 */
export interface FieldProblem {
  field: string
  message: string
  type: string
}

interface Envelope {
  error: { code: string; message: string; details?: unknown; request_id?: string | null }
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: unknown
  readonly requestId: string | null
  /** From a Retry-After header (429, 503): how long to wait before trying again. */
  readonly retryAfterMs: number | null

  constructor(
    status: number,
    code: string,
    message: string,
    details: unknown = null,
    requestId: string | null = null,
    retryAfterMs: number | null = null,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
    this.requestId = requestId
    this.retryAfterMs = retryAfterMs
  }

  /** Per-field validation problems (422), keyed by field path. */
  fieldErrors(): Record<string, string> {
    if (!Array.isArray(this.details)) return {}
    const out: Record<string, string> = {}
    for (const item of this.details as unknown[]) {
      if (isFieldProblem(item)) out[item.field] = item.message
    }
    return out
  }
}

function isFieldProblem(value: unknown): value is FieldProblem {
  return typeof value === 'object' && value !== null && 'field' in value && 'message' in value
}

function isEnvelope(value: unknown): value is Envelope {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false
  const error = value.error
  return typeof error === 'object' && error !== null && 'code' in error && 'message' in error
}

/**
 * Parse Retry-After, which is either delta-seconds ("120") or an HTTP date. Null when absent or
 * unreadable; a date in the past means "now".
 */
export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (!value) return null
  const trimmed = value.trim()
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000
  const at = Date.parse(trimmed)
  return Number.isNaN(at) ? null : Math.max(0, at - now)
}

/** Build an ApiError from a response body, whatever shape it has. */
export function toApiError(status: number, body: unknown, headers?: Headers): ApiError {
  const retryAfterMs = parseRetryAfter(headers?.get('Retry-After') ?? null)
  if (isEnvelope(body)) {
    const { code, message, details, request_id } = body.error
    return new ApiError(status, code, message, details ?? null, request_id ?? null, retryAfterMs)
  }
  return new ApiError(
    status,
    'unexpected_response',
    'Something went wrong. Please try again.',
    null,
    null,
    retryAfterMs,
  )
}

/** Network failures (offline, DNS, CORS) never reach the server, so they get their own code. */
export function networkError(): ApiError {
  return new ApiError(0, 'network_error', 'Could not reach the server. Check your connection and try again.')
}
