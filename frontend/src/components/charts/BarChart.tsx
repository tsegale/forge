import { useId } from 'react'

export interface Bar {
  label: string
  /** Shown under the bar; empty to skip (dense series label every few bars). */
  tick: string
  value: number
}

const WIDTH = 640
const HEIGHT = 200
const PAD = { top: 12, right: 8, bottom: 26, left: 8 }

/**
 * A column chart, hand-built in SVG: one bar per entry, the largest scaled to the full height.
 * Named and summarised for screen readers, with the same numbers as a table beneath.
 */
export function BarChart({
  bars,
  title,
  formatValue,
  summary,
}: {
  bars: Bar[]
  title: string
  formatValue: (value: number) => string
  summary: string
}) {
  const id = useId()
  const max = Math.max(...bars.map((b) => b.value), 1)
  const plotW = WIDTH - PAD.left - PAD.right
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const slot = plotW / Math.max(bars.length, 1)
  const barW = Math.max(slot * 0.68, 2)

  return (
    <figure>
      <svg
        role="img"
        aria-labelledby={`${id}-t`}
        aria-describedby={`${id}-d`}
        viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
        className="h-auto w-full"
      >
        <title id={`${id}-t`}>{title}</title>
        <desc id={`${id}-d`}>{summary}</desc>
        <line
          x1={PAD.left}
          x2={WIDTH - PAD.right}
          y1={PAD.top + plotH}
          y2={PAD.top + plotH}
          className="stroke-border-strong"
        />
        {bars.map((bar, i) => {
          const h = (bar.value / max) * plotH
          const x = PAD.left + i * slot + (slot - barW) / 2
          return (
            <g key={`${bar.label}-${String(i)}`}>
              <rect
                x={x}
                y={PAD.top + plotH - h}
                width={barW}
                height={Math.max(h, bar.value > 0 ? 1.5 : 0)}
                rx={1.5}
                className="fill-accent"
              >
                <title>{`${bar.label}: ${formatValue(bar.value)}`}</title>
              </rect>
              {bar.tick ? (
                <text
                  x={x + barW / 2}
                  y={HEIGHT - 8}
                  textAnchor="middle"
                  className="fill-ink-subtle text-[11px]"
                >
                  {bar.tick}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer font-medium text-accent hover:underline">
          Show the data as a table
        </summary>
        <table className="mt-2 w-full max-w-md text-left">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="border-b border-border text-ink-subtle">
              <th scope="col" className="py-1.5 font-medium">
                Day
              </th>
              <th scope="col" className="py-1.5 text-right font-medium">
                Value
              </th>
            </tr>
          </thead>
          <tbody>
            {bars.map((bar, i) => (
              <tr key={`${bar.label}-${String(i)}`} className="border-b border-border last:border-0">
                <td className="py-1.5 text-ink-muted">{bar.label}</td>
                <td className="py-1.5 text-right text-ink tabular">{formatValue(bar.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
