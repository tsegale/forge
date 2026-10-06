import { RotateCcw } from 'lucide-react'
import { ApiError } from '@/api/errors'
import { Alert } from './Alert'
import { Button } from './Button'

/**
 * An API error, with its reference id so a support request can be traced in the logs. Pass
 * `onRetry` for errors worth retrying (network failures, 5xx); it is offered only for those.
 */
export function ErrorMessage({
  error,
  title,
  onRetry,
  retrying = false,
}: {
  error: unknown
  title?: string
  onRetry?: () => void
  retrying?: boolean
}) {
  if (!error) return null
  const apiError = error instanceof ApiError ? error : null
  const retryable = !apiError || apiError.status === 0 || apiError.status >= 500
  return (
    <Alert
      tone="danger"
      title={title ?? apiError?.message ?? 'Something went wrong. Please try again.'}
      action={
        onRetry && retryable ? (
          <Button
            variant="secondary"
            size="sm"
            busy={retrying}
            icon={<RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />}
            onClick={onRetry}
          >
            Try again
          </Button>
        ) : undefined
      }
    >
      {title && apiError ? <p>{apiError.message}</p> : null}
      {apiError?.requestId ? (
        <p className="mt-1 font-tech text-xs text-ink-subtle">Reference: {apiError.requestId}</p>
      ) : null}
    </Alert>
  )
}
