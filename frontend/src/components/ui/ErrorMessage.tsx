import { ApiError } from '@/api/errors'
import { Alert } from './Alert'

/** Shows an API error with its reference id, so a support request can be traced in the logs. */
export function ErrorMessage({ error, title }: { error: unknown; title?: string }) {
  if (!error) return null
  const apiError = error instanceof ApiError ? error : null
  return (
    <Alert tone="danger" title={title ?? apiError?.message ?? 'Something went wrong. Please try again.'}>
      {title && apiError ? <p>{apiError.message}</p> : null}
      {apiError?.requestId ? <p className="mt-1 text-xs">Reference: {apiError.requestId}</p> : null}
    </Alert>
  )
}
