import { clsx } from 'clsx'
import type { CompatibilityReport } from '@/builds/api'

/**
 * Estimated draw against the chosen power supply. The bar shows peak draw (graphics card power
 * excursions), which is what trips an undersized supply, as a share of its rating.
 */
export function PowerMeter({
  power,
  psuWatts,
}: {
  power: CompatibilityReport['power']
  psuWatts: number | null
}) {
  const share = psuWatts ? power.peak_w / psuWatts : null
  const tone =
    share === null
      ? 'bg-ink-subtle'
      : share > 1
        ? 'bg-danger'
        : psuWatts !== null && psuWatts < power.recommended_psu_w
          ? 'bg-warning'
          : 'bg-success'

  return (
    <section aria-labelledby="power-heading">
      <h3 id="power-heading" className="text-sm font-semibold">
        Power
      </h3>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-ink-muted">Sustained</dt>
        <dd className="text-right tabular">{power.sustained_w} W</dd>
        <dt className="text-ink-muted">Peak</dt>
        <dd className="text-right tabular">{power.peak_w} W</dd>
        <dt className="text-ink-muted">Recommended supply</dt>
        <dd className="text-right tabular">{power.recommended_psu_w} W</dd>
        <dt className="text-ink-muted">Your supply</dt>
        <dd className="text-right tabular">{psuWatts ? `${psuWatts} W` : 'Not chosen'}</dd>
      </dl>
      {psuWatts ? (
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-canvas"
          role="meter"
          aria-label="Peak draw as a share of the power supply rating"
          aria-valuemin={0}
          aria-valuemax={psuWatts}
          aria-valuenow={Math.min(power.peak_w, psuWatts)}
          aria-valuetext={`${power.peak_w} W of ${psuWatts} W`}
        >
          <div
            className={clsx('h-full rounded-full', tone)}
            style={{ width: `${Math.min((share ?? 0) * 100, 100).toFixed(1)}%` }}
          />
        </div>
      ) : null}
    </section>
  )
}
