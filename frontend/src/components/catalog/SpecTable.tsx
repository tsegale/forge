import type { ReactNode } from 'react'

export interface SpecGroup {
  title: string
  rows: { label: string; value: ReactNode }[]
}

/**
 * Specifications in titled groups, values in the monospace face so numbers line up. A real table
 * (row headers and caption) so screen readers announce "Socket, AM5".
 */
export function SpecTable({ groups, caption = 'Specifications' }: { groups: SpecGroup[]; caption?: string }) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface">
      <table className="w-full text-base">
        <caption className="sr-only">{caption}</caption>
        {groups.map((group) => (
          <tbody key={group.title} className="border-b border-border last:border-0">
            <tr>
              <th
                scope="colgroup"
                colSpan={2}
                className="bg-canvas px-4 py-2 text-left text-xs font-semibold tracking-wide text-ink-muted uppercase"
              >
                {group.title}
              </th>
            </tr>
            {group.rows.map((row) => (
              <tr key={row.label} className="border-t border-border first:border-t-0">
                <th scope="row" className="w-2/5 px-4 py-2.5 text-left align-top font-normal text-ink-muted">
                  {row.label}
                </th>
                <td className="px-4 py-2.5 font-tech text-sm text-ink">{row.value}</td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  )
}
