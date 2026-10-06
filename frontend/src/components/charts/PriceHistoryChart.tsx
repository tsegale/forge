import { useId } from 'react'
import { formatCents } from '@/lib/money'

export interface PricePoint {
  at: string
  price_cents: number
}

const WIDTH = 640
const HEIGHT = 220
const PAD = { top: 16, right: 16, bottom: 28, left: 76 }
const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })
const LONG_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

/** Whole-dollar label for an axis ("N$ 7,999"); the table keeps the cents. */
function axisPrice(cents: number): string {
  return formatCents(Math.round(cents / 100) * 100).replace(/\.00$/, '')
}

/**
 * A price history as a step chart: each price holds until the next change. Hand-built SVG (no
 * chart library), with a title and summary for screen readers and the same data as a table.
 */
export function PriceHistoryChart({
  points,
  currentCents,
  now = new Date(),
  title,
}: {
  points: PricePoint[]
  currentCents: number
  now?: Date
  title: string
}) {
  const id = useId()
  if (!points.length) return null
  const first = points[0]
  if (!first) return null
  const start = new Date(first.at).getTime()
  const end = Math.max(now.getTime(), start + 1)
  const prices = points.map((p) => p.price_cents)
  const low = Math.min(...prices)
  const high = Math.max(...prices)
  const span = high - low || Math.max(high * 0.05, 100)
  const yMin = low - span * 0.15
  const yMax = high + span * 0.15

  const plotW = WIDTH - PAD.left - PAD.right
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const x = (t: number) => PAD.left + ((t - start) / (end - start)) * plotW
  const y = (cents: number) => PAD.top + (1 - (cents - yMin) / (yMax - yMin)) * plotH

  let path = ''
  points.forEach((point, index) => {
    const px = x(new Date(point.at).getTime())
    const py = y(point.price_cents)
    path += index === 0 ? `M${px.toFixed(1)},${py.toFixed(1)}` : `H${px.toFixed(1)}V${py.toFixed(1)}`
  })
  path += `H${x(end).toFixed(1)}`
  const area = `${path}V${(PAD.top + plotH).toFixed(1)}H${PAD.left}Z`

  const lowest = points.reduce((best, p) => (p.price_cents < best.price_cents ? p : best), first)
  const ticks = high === low ? [low] : [low, Math.round((low + high) / 2), high]
  const dates = [start, start + (end - start) / 2, end]
  const summary =
    `${formatCents(first.price_cents)} at the start, ${formatCents(currentCents)} now. ` +
    `Lowest ${formatCents(lowest.price_cents)} on ${LONG_DATE.format(new Date(lowest.at))}, ` +
    `highest ${formatCents(high)}.`

  return (
    <figure>
      <svg
        role="img"
        aria-labelledby={`${id}-t`}
        aria-describedby={`${id}-d`}
        viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
        className="h-auto w-full overflow-visible"
      >
        <title id={`${id}-t`}>{title}</title>
        <desc id={`${id}-d`}>{summary}</desc>
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(tick)}
              y2={y(tick)}
              className="stroke-border"
              strokeDasharray="3 4"
            />
            <text
              x={PAD.left - 10}
              y={y(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-ink-subtle font-tech text-[11px]"
            >
              {axisPrice(tick)}
            </text>
          </g>
        ))}
        {dates.map((t, index) => (
          <text
            key={t}
            x={x(t)}
            y={HEIGHT - 8}
            textAnchor={index === 0 ? 'start' : index === dates.length - 1 ? 'end' : 'middle'}
            className="fill-ink-subtle text-[11px]"
          >
            {index === dates.length - 1 ? 'Today' : DATE.format(new Date(t))}
          </text>
        ))}
        <path d={area} className="fill-accent-soft" />
        <path d={path} fill="none" className="stroke-accent" strokeWidth={2} strokeLinejoin="round" />
        <circle
          cx={x(new Date(lowest.at).getTime())}
          cy={y(lowest.price_cents)}
          r={4}
          className="fill-surface stroke-success"
          strokeWidth={2}
        />
        <circle cx={x(end)} cy={y(currentCents)} r={4} className="fill-accent" />
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-muted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-accent" /> Now{' '}
          <span className="font-medium text-ink tabular">{formatCents(currentCents)}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full border-2 border-success bg-surface" />{' '}
          Lowest <span className="font-medium text-ink tabular">{formatCents(lowest.price_cents)}</span>
        </span>
      </figcaption>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-medium text-accent hover:underline">
          Show the data as a table
        </summary>
        <table className="mt-2 w-full max-w-md text-left">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="border-b border-border text-ink-subtle">
              <th scope="col" className="py-1.5 font-medium">
                From
              </th>
              <th scope="col" className="py-1.5 text-right font-medium">
                Price
              </th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.at} className="border-b border-border last:border-0">
                <td className="py-1.5 text-ink-muted">{LONG_DATE.format(new Date(point.at))}</td>
                <td className="py-1.5 text-right text-ink tabular">{formatCents(point.price_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
