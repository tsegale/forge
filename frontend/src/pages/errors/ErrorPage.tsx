import { Braces } from 'lucide-react'
import type { ReactNode } from 'react'
import { setInspectorOpen } from '@/inspector/store'

/**
 * The frame every error page shares: the status, what happened in plain words, what to do next,
 * and (for failures the server saw) the reference that finds it in the logs.
 */
export function ErrorPage({
  code,
  title,
  children,
  actions,
  reference,
}: {
  code: string
  title: string
  children?: ReactNode
  actions?: ReactNode
  reference?: string | null
}) {
  return (
    <section aria-labelledby="error-heading" className="mx-auto max-w-xl py-16 text-center">
      <p className="font-tech text-sm font-semibold tracking-wide text-accent">{code}</p>
      <h1 id="error-heading" className="mt-2 text-3xl font-semibold tracking-tight text-ink">
        {title}
      </h1>
      {children ? <div className="mt-3 text-base text-ink-muted">{children}</div> : null}
      {actions ? <div className="mt-8 flex flex-wrap justify-center gap-3">{actions}</div> : null}
      {reference ? (
        <div className="mt-8 inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-md border border-border bg-surface px-4 py-2 text-sm">
          <span className="text-ink-muted">
            Reference <span className="font-tech text-ink">{reference}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              setInspectorOpen(true)
            }}
            className="inline-flex items-center gap-1.5 font-medium text-accent hover:underline"
          >
            <Braces aria-hidden="true" className="h-4 w-4" /> Open the API Inspector
          </button>
        </div>
      ) : null}
    </section>
  )
}
