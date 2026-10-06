import { Braces, Check, Copy, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button, IconButton } from '@/components/ui/Button'
import { Drawer } from '@/components/ui/Dialog'
import { Checkbox } from '@/components/ui/Field'
import { clearCalls, setInspectorOpen, useApiCalls, useInspectorOpen, type ApiCall } from '@/inspector/store'
import { curlFor } from '@/inspector/curl'
import { cn } from '@/lib/cn'

const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

function statusTone(call: ApiCall): string {
  if (call.status === null)
    return call.errorCode ? 'bg-danger-soft text-danger-ink' : 'bg-surface-muted text-ink-muted'
  if (call.status >= 500) return 'bg-danger-soft text-danger-ink'
  if (call.status >= 400) return 'bg-warning-soft text-warning-ink'
  return 'bg-success-soft text-success-ink'
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => {
            setCopied(false)
          }, 1500)
        })
      }}
    >
      {copied ? (
        <Check aria-hidden="true" className="h-4 w-4" />
      ) : (
        <Copy aria-hidden="true" className="h-4 w-4" />
      )}
      {copied ? 'Copied' : label}
    </Button>
  )
}

/** Where the time went: PostgreSQL, the rest of the Flask app, and the network and browser. */
function TimingBar({ call }: { call: ApiCall }) {
  if (call.durationMs === null) return null
  const total = Math.max(call.durationMs, 1)
  const db = call.timing?.dbMs ?? 0
  const app = Math.max((call.timing?.appMs ?? 0) - db, 0)
  const network = Math.max(total - db - app, 0)
  const segments = [
    { label: 'PostgreSQL', ms: db, className: 'bg-accent' },
    { label: 'Flask', ms: app, className: 'bg-ink-subtle' },
    { label: 'Network and browser', ms: network, className: 'bg-border-strong' },
  ]
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
        {segments.map((s) => (
          <span key={s.label} className={s.className} style={{ width: `${String((s.ms / total) * 100)}%` }} />
        ))}
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
        {segments.map((s) => (
          <div key={s.label}>
            <dt className="flex items-center gap-1.5 text-ink-muted">
              <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', s.className)} />
              {s.label}
            </dt>
            <dd className="font-tech text-ink tabular">{s.ms.toFixed(1)} ms</dd>
          </div>
        ))}
      </dl>
      {call.timing?.statements !== null && call.timing?.statements !== undefined ? (
        <p className="mt-1 text-sm text-ink-muted">
          {call.timing.statements} SQL {call.timing.statements === 1 ? 'statement' : 'statements'}
        </p>
      ) : null}
    </div>
  )
}

function Detail({ call }: { call: ApiCall }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-sm bg-surface-muted px-1.5 py-0.5 font-tech text-xs font-semibold text-ink">
          {call.method}
        </span>
        <span className="min-w-0 font-tech text-sm break-all text-ink">{call.path}</span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-ink-muted">Status</dt>
        <dd className="font-tech text-ink">
          {call.status ?? 'No response'}
          {call.errorCode ? ` (${call.errorCode})` : ''}
        </dd>
        <dt className="text-ink-muted">Request id</dt>
        <dd className="font-tech break-all text-ink">{call.requestId ?? 'None'}</dd>
        <dt className="text-ink-muted">Total time</dt>
        <dd className="font-tech text-ink">
          {call.durationMs === null ? 'Pending' : `${String(call.durationMs)} ms`}
        </dd>
      </dl>
      <TimingBar call={call} />
      <div className="flex flex-wrap gap-2">
        <CopyButton text={curlFor(call, globalThis.location.origin)} label="Copy as curl" />
        {call.requestId ? <CopyButton text={call.requestId} label="Copy request id" /> : null}
      </div>
      {call.requestBody ? (
        <section aria-label="Request body">
          <h3 className="text-sm font-semibold text-ink">Request body</h3>
          <pre className="mt-1 max-h-48 overflow-auto rounded-sm border border-border bg-surface-muted p-3 font-tech text-xs text-ink">
            {call.requestBody}
          </pre>
        </section>
      ) : null}
      <section aria-label="Response body">
        <h3 className="text-sm font-semibold text-ink">Response body</h3>
        <pre className="mt-1 max-h-80 overflow-auto rounded-sm border border-border bg-surface-muted p-3 font-tech text-xs text-ink">
          {call.responseBody ?? '(empty)'}
        </pre>
      </section>
      <p className="text-xs text-ink-subtle">
        Tokens, passwords and client secrets are redacted; the Authorization header is never recorded.
      </p>
    </div>
  )
}

/**
 * The API Inspector: the last 50 calls this tab made, newest first. Opened from the footer, it
 * shows the store working underneath (each request, its timing in Flask and PostgreSQL from the
 * backend's Server-Timing header, and the request id that finds it in the server logs).
 */
export function ApiInspector() {
  const open = useInspectorOpen()
  const calls = useApiCalls()
  const [selected, setSelected] = useState<number | null>(null)
  const [errorsOnly, setErrorsOnly] = useState(false)
  const shown = errorsOnly ? calls.filter((c) => c.errorCode !== null || (c.status ?? 0) >= 400) : calls
  const current = shown.find((c) => c.id === selected) ?? shown[0]

  return (
    <Drawer
      open={open}
      onOpenChange={setInspectorOpen}
      title="API Inspector"
      description="Every call this page makes to the Forge API, with timing from the server."
      width="lg"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <Checkbox
            label="Errors only"
            checked={errorsOnly}
            onChange={(event) => {
              setErrorsOnly(event.target.checked)
            }}
          />
          <IconButton label="Clear the list" variant="secondary" size="sm" onClick={clearCalls}>
            <Trash2 aria-hidden="true" className="h-4 w-4" />
          </IconButton>
        </div>
        {shown.length ? (
          <>
            <ul
              aria-label="API calls"
              className="max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border"
            >
              {shown.map((call) => (
                <li key={call.id}>
                  <button
                    type="button"
                    aria-current={current?.id === call.id ? 'true' : undefined}
                    onClick={() => {
                      setSelected(call.id)
                    }}
                    className={cn(
                      'grid w-full grid-cols-[3.5rem_1fr_auto] items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-muted',
                      current?.id === call.id && 'bg-accent-soft',
                    )}
                  >
                    <span className="font-tech text-xs font-semibold text-ink-muted">{call.method}</span>
                    <span className="min-w-0 truncate font-tech text-xs text-ink">{call.path}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-tech text-xs text-ink-subtle tabular">
                        {call.durationMs === null ? '...' : `${String(call.durationMs)} ms`}
                      </span>
                      <span
                        className={cn(
                          'rounded-sm px-1.5 py-0.5 font-tech text-xs font-medium',
                          statusTone(call),
                        )}
                      >
                        {call.status ?? (call.errorCode ? 'ERR' : '...')}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {current ? (
              <section aria-label="Selected call" className="border-t border-border pt-4">
                <p className="mb-2 text-xs text-ink-subtle">{TIME.format(new Date(current.startedAt))}</p>
                <Detail call={current} />
              </section>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-ink-muted">
            {errorsOnly ? 'No failed calls yet.' : 'No calls yet. Use the store and they appear here.'}
          </p>
        )}
      </div>
    </Drawer>
  )
}

/** The footer button that opens the inspector. */
export function InspectorToggle() {
  const calls = useApiCalls()
  return (
    <button
      type="button"
      onClick={() => {
        setInspectorOpen(true)
      }}
      className="inline-flex items-center gap-2 rounded-sm font-medium text-ink-muted hover:text-accent"
    >
      <Braces aria-hidden="true" className="h-4 w-4" />
      API Inspector
      {calls.length ? <span className="text-ink-subtle tabular">({calls.length})</span> : null}
    </button>
  )
}
