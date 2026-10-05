import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { buildsQuery, deleteBuild } from '@/builds/api'
import { setDraft, useDraft } from '@/builds/store'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { formatPrice } from '@/lib/money'

const STATUS: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-canvas text-ink-muted' },
  validated: { label: 'Validated', className: 'bg-success-soft text-success' },
  ordered: { label: 'Ordered', className: 'bg-accent-soft text-accent' },
}

const DATE = new Intl.DateTimeFormat('en-NA', { dateStyle: 'medium', timeStyle: 'short' })

/** The signed-in customer's saved builds. */
export function BuildsPage() {
  const queryClient = useQueryClient()
  const builds = useQuery(buildsQuery)
  const draft = useDraft()
  const remove = useMutation({
    mutationFn: deleteBuild,
    onSuccess: (_data, buildId) => {
      if (draft.buildId === buildId) setDraft((current) => ({ ...current, buildId: null, ownerId: null }))
      return queryClient.invalidateQueries({ queryKey: buildsQuery.queryKey })
    },
  })

  return (
    <section aria-labelledby="builds-heading">
      <div className="flex items-center justify-between">
        <h1 id="builds-heading" className="text-2xl font-semibold">
          My builds
        </h1>
        <Button asChild>
          <Link to="/configurator">Open the configurator</Link>
        </Button>
      </div>

      <div className="mt-6 space-y-4">
        <ErrorMessage error={builds.error ?? remove.error} />
        {builds.isPending ? <p className="text-sm text-ink-muted">Loading</p> : null}
        {builds.data?.items.length === 0 ? (
          <p className="text-ink-muted">
            No saved builds yet. Configure one and save it to come back to it later.
          </p>
        ) : null}
        {builds.data?.items.length ? (
          <table className="w-full overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface text-sm">
            <thead className="bg-canvas text-left text-ink-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  Name
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Parts
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Subtotal
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Last changed
                </th>
                <th scope="col" className="px-4 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {builds.data.items.map((build) => {
                const status = STATUS[build.status] ?? STATUS.draft
                return (
                  <tr key={build.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{build.name}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${status?.className ?? ''}`}>
                        {status?.label ?? build.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular">{build.item_count}</td>
                    <td className="px-4 py-3 text-right tabular">{formatPrice(build.subtotal)}</td>
                    <td className="px-4 py-3 text-ink-muted">{DATE.format(new Date(build.updated_at))}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button asChild variant="secondary">
                          <Link to={`/configurator?build=${String(build.id)}`}>Open</Link>
                        </Button>
                        {build.status === 'ordered' ? null : (
                          <Button
                            variant="ghost"
                            busy={remove.isPending && remove.variables === build.id}
                            aria-label={`Delete ${build.name}`}
                            onClick={() => {
                              remove.mutate(build.id)
                            }}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : null}
      </div>
    </section>
  )
}
