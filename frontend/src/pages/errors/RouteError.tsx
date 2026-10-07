import { Link, isRouteErrorResponse, useRouteError } from 'react-router'
import { ApiError } from '@/api/errors'
import { Button } from '@/components/ui/Button'
import { usePageTitle } from '@/lib/usePageTitle'
import { NotFound } from '@/pages/NotFound'
import { ErrorPage } from './ErrorPage'

/**
 * What a page shows when it fails to render: the store frame stays, the customer gets a way
 * forward, and an API failure shows its reference (the X-Request-ID in the server logs).
 */
export function RouteError() {
  const error = useRouteError()
  usePageTitle('Something went wrong')
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />
  const apiError = error instanceof ApiError ? error : null
  const offline = apiError?.status === 0
  return (
    <ErrorPage
      code={offline ? 'Offline' : apiError ? String(apiError.status) : 'Error'}
      title={offline ? 'You appear to be offline' : 'Something went wrong'}
      reference={apiError?.requestId ?? null}
      actions={
        <>
          <Button
            onClick={() => {
              globalThis.location.reload()
            }}
          >
            Reload the page
          </Button>
          <Button asChild variant="secondary">
            <Link to="/">Go to the home page</Link>
          </Button>
        </>
      }
    >
      <p>
        {offline
          ? 'Forge could not be reached. Check your connection; nothing you were doing has been lost.'
          : 'This page hit a problem it could not recover from. Reloading usually fixes it. Your cart and saved builds are safe.'}
      </p>
    </ErrorPage>
  )
}
