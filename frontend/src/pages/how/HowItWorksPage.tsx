import { Braces, Database, Layers, Lock, Palette, ShieldCheck, Timer } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { Button } from '@/components/ui/Button'
import { setInspectorOpen } from '@/inspector/store'
import { usePageTitle } from '@/lib/usePageTitle'

const RULES = [
  ['Socket', 'The processor and motherboard share a socket; the cooler supports it.'],
  ['Memory', 'Type (DDR4 or DDR5), slots, the board maximum, and a warning for mixed kits.'],
  ['Form factor', 'The case takes the motherboard size, and the power supply size (ATX, SFX, SFX-L).'],
  ['Graphics card clearance', 'Card length against the case limit, in millimetres.'],
  ['Cooler fit', 'Cooler height against the case limit; radiator size against the case mounts.'],
  ['Cooler capacity', 'The cooler is rated for the processor at full power.'],
  [
    'Power',
    'Sustained and peak draw (graphics card spikes included) against the supply and its ATX version.',
  ],
  ['Storage', 'M.2 slots and SATA ports for every drive.'],
] as const

const ENFORCED: [string, string, string][] = [
  [
    'Every product is exactly one kind',
    'Composite foreign keys and CHECK constraints',
    'A processor row cannot also be a case.',
  ],
  [
    'Slot limits per build',
    'Trigger, locking the build row',
    'One processor; up to four memory kits, even with two tabs racing.',
  ],
  [
    'Ordered builds are frozen',
    'Trigger (build_locked)',
    'A build that was bought cannot be edited or deleted.',
  ],
  [
    'Order status moves only along allowed paths',
    'Trigger and a transitions table',
    'Shipped cannot go back to paid.',
  ],
  [
    'Paid needs a matching payment',
    'Trigger (order_payment_required)',
    'No order is paid without a succeeded payment for its exact total.',
  ],
  [
    'Stock is never oversold',
    'CHECK constraints and reservation triggers',
    'Reserved can never exceed what is on hand.',
  ],
  [
    'Every price and stock change is kept',
    'Triggers into price_history (partitioned by month) and inventory_events',
    'Price drops, restocks and the audit log come from these.',
  ],
  [
    'Audit logs cannot be rewritten',
    'Append-only triggers',
    'Order history, payment events and stock events refuse updates.',
  ],
  [
    'Verified purchase badges are earned',
    'Trigger on reviews and orders',
    'The badge follows paid orders; a refund removes it.',
  ],
  [
    'One live password reset link',
    'Partial unique index, hashed tokens',
    'Asking again cancels the previous link.',
  ],
]

/** The order lifecycle, drawn from the order_status_transitions table. */
function OrderStates() {
  const id = useId()
  const nodes = {
    pending_payment: { x: 10, y: 30, label: 'Awaiting payment' },
    paid: { x: 190, y: 30, label: 'Paid' },
    fulfilling: { x: 350, y: 30, label: 'Being prepared' },
    shipped: { x: 510, y: 30, label: 'Shipped' },
    delivered: { x: 670, y: 30, label: 'Delivered' },
    cancelled: { x: 100, y: 150, label: 'Cancelled' },
    refunded: { x: 430, y: 150, label: 'Refunded' },
  } as const
  type State = keyof typeof nodes
  const W = 140
  const H = 40
  const edges: [State, State][] = [
    ['pending_payment', 'paid'],
    ['paid', 'fulfilling'],
    ['fulfilling', 'shipped'],
    ['shipped', 'delivered'],
    ['pending_payment', 'cancelled'],
    ['cancelled', 'paid'],
    ['paid', 'refunded'],
    ['fulfilling', 'refunded'],
    ['delivered', 'refunded'],
    ['cancelled', 'refunded'],
  ]
  const centre = (s: State) => ({ x: nodes[s].x + W / 2, y: nodes[s].y + H / 2 })
  const edge = (from: State, to: State) => {
    const a = centre(from)
    const b = centre(to)
    // Leave and enter at the box edge, not its centre.
    const dx = b.x - a.x
    const dy = b.y - a.y
    const clip = (p: { x: number; y: number }, sign: number) => {
      const tx = dx === 0 ? Infinity : W / 2 / Math.abs(dx)
      const ty = dy === 0 ? Infinity : H / 2 / Math.abs(dy)
      const t = Math.min(tx, ty)
      return { x: p.x + sign * dx * t, y: p.y + sign * dy * t }
    }
    const start = clip(a, 1)
    const end = clip(b, -1)
    return `M${start.x.toFixed(1)},${start.y.toFixed(1)} L${end.x.toFixed(1)},${end.y.toFixed(1)}`
  }
  return (
    <figure>
      <svg
        role="img"
        aria-labelledby={`${id}-t`}
        aria-describedby={`${id}-d`}
        viewBox="0 0 820 210"
        className="h-auto w-full"
      >
        <title id={`${id}-t`}>Order lifecycle</title>
        <desc id={`${id}-d`}>
          Awaiting payment goes to paid or cancelled. Paid goes to being prepared, then shipped, then
          delivered. Paid, being prepared, delivered and cancelled orders can be refunded, and a cancelled
          order can still be paid by a late payment.
        </desc>
        <defs>
          <marker
            id={`${id}-arrow`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto"
          >
            <path d="M0,0 L10,5 L0,10 z" className="fill-ink-subtle" />
          </marker>
        </defs>
        {edges.map(([from, to]) => (
          <path
            key={`${from}-${to}`}
            d={edge(from, to)}
            className="stroke-ink-subtle"
            strokeWidth={1.5}
            fill="none"
            markerEnd={`url(#${id}-arrow)`}
          />
        ))}
        {(Object.keys(nodes) as State[]).map((state) => (
          <g key={state}>
            <rect
              x={nodes[state].x}
              y={nodes[state].y}
              width={W}
              height={H}
              rx={4}
              className={
                state === 'cancelled' || state === 'refunded'
                  ? 'fill-surface-muted stroke-border-strong'
                  : 'fill-accent-soft stroke-accent'
              }
            />
            <text
              x={nodes[state].x + W / 2}
              y={nodes[state].y + H / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-ink text-[13px] font-medium"
            >
              {nodes[state].label}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="mt-2 text-sm text-ink-muted">
        The arrows are the rows of <code className="font-tech">order_status_transitions</code>; a trigger
        refuses any other move, whatever code tries it.
      </figcaption>
    </figure>
  )
}

function Section({
  id,
  icon: Icon,
  title,
  children,
}: {
  id: string
  icon: typeof Database
  title: string
  children: ReactNode
}) {
  return (
    <section aria-labelledby={id} className="border-t border-border pt-10">
      <h2 id={id} className="flex items-center gap-3 text-2xl font-semibold tracking-tight text-ink">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent-soft text-accent">
          <Icon aria-hidden="true" className="h-5 w-5" />
        </span>
        {title}
      </h2>
      <div className="mt-5 flex flex-col gap-5 text-base text-ink-muted">{children}</div>
    </section>
  )
}

/**
 * The engineering behind the store, for the curious customer and the examiner: what is checked,
 * which rules the database itself enforces, how checkout keeps stock honest, and where to look.
 */
export function HowItWorksPage() {
  usePageTitle('How Forge works')
  return (
    <article className="mx-auto flex max-w-4xl flex-col gap-10">
      <header>
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'How Forge works' }]} />
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">How Forge works</h1>
        <p className="mt-3 max-w-2xl text-lg text-ink-muted">
          Forge is a PC parts store where compatibility is enforced, not suggested. The rules live in a
          compatibility engine and in PostgreSQL itself, so they hold for every request, every admin edit and
          every background job.
        </p>
        <nav aria-label="On this page" className="mt-6">
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium">
            {[
              ['engine', 'The compatibility engine'],
              ['database', 'Rules in the database'],
              ['checkout', 'Checkout and stock'],
              ['security', 'Security'],
              ['explore', 'Look inside'],
            ].map(([href, label]) => (
              <li key={href}>
                <a href={`#${href}`} className="text-accent hover:underline">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <Section id="engine" icon={Layers} title="The compatibility engine">
        <p>
          Each rule is a small class with two halves: <strong className="text-ink">check</strong>, which reads
          a build and reports conflicts and warnings with the measured values behind them, and{' '}
          <strong className="text-ink">a SQL filter</strong>, which narrows a catalog list to parts that would
          not conflict. The configurator shows the first; every part picker and the catalog&rsquo;s
          &ldquo;fits my build&rdquo; switch use the second. A test runs every seeded part against several
          reference builds and fails if the two halves ever disagree.
        </p>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {RULES.map(([title, text]) => (
            <li key={title} className="rounded-md border border-border bg-surface p-4">
              <p className="font-medium text-ink">{title}</p>
              <p className="mt-1 text-sm">{text}</p>
            </li>
          ))}
        </ul>
        <p>
          A conflict means the build cannot work as specified and blocks checkout. A warning means it works
          but needs attention (a power adapter, thin headroom, mixed memory kits). Missing parts are reported
          separately, so a build can be compatible but not yet complete.
        </p>
      </Section>

      <Section id="database" icon={Database} title="Rules in the database">
        <p>
          The application gives friendly errors, but the guarantees come from PostgreSQL: constraints and
          triggers that no code path can skip. When one is violated, the API turns its name into a precise
          error.
        </p>
        <div
          className="relative overflow-x-auto rounded-md border border-border bg-surface"
          tabIndex={0}
          role="region"
          aria-label="Rules the database enforces"
        >
          <table className="w-full min-w-[40rem] text-left text-sm">
            <caption className="sr-only">Rules the database enforces, and how</caption>
            <thead className="bg-surface-muted text-ink-subtle">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  Rule
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  How
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  In practice
                </th>
              </tr>
            </thead>
            <tbody>
              {ENFORCED.map(([rule, how, example]) => (
                <tr key={rule} className="border-t border-border align-top">
                  <th scope="row" className="px-4 py-2.5 font-medium text-ink">
                    {rule}
                  </th>
                  <td className="px-4 py-2.5 text-ink-muted">{how}</td>
                  <td className="px-4 py-2.5 text-ink-muted">{example}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="checkout" icon={Timer} title="Checkout and stock">
        <p>
          Checkout is two phases. <strong className="text-ink">Reserve</strong>: the order locks its
          products&rsquo; stock rows in a fixed order (so two checkouts can never deadlock), checks
          availability and records a reservation that expires in a few minutes.{' '}
          <strong className="text-ink">Pay</strong>: the card payment goes straight to Stripe, and the order
          becomes paid only when Stripe&rsquo;s signed webhook arrives. Each webhook is applied once, recorded
          in a ledger. A background job releases holds that run out.
        </p>
        <OrderStates />
      </Section>

      <Section id="security" icon={Lock} title="Security">
        <ul className="flex flex-col gap-2">
          <li>
            Passwords are hashed with Argon2. Sign-in issues a short-lived access token kept only in memory,
            and a refresh token in an HttpOnly cookie that rotates on every use; reusing an old one signs out
            the whole family.
          </li>
          <li>Card details never reach Forge: Stripe&rsquo;s form runs in its own frame.</li>
          <li>
            Sign-in, registration, reviews and password resets are rate limited; the reset never reveals who
            has an account.
          </li>
          <li>A strict Content Security Policy allows scripts only from this site and Stripe.</li>
        </ul>
      </Section>

      <Section id="explore" icon={ShieldCheck} title="Look inside">
        <p>
          Every API response carries a request id and a Server-Timing header with the time spent in Flask and
          in PostgreSQL. The API Inspector shows both for each call this page makes.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => {
              setInspectorOpen(true)
            }}
            className="flex flex-col items-start rounded-md border border-border bg-surface p-4 text-left hover:border-ink-subtle"
          >
            <Braces aria-hidden="true" className="h-5 w-5 text-accent" />
            <span className="mt-2 font-medium text-ink">API Inspector</span>
            <span className="text-sm">Every call, its timing and request id.</span>
          </button>
          <a
            href="/api/docs"
            className="flex flex-col rounded-md border border-border bg-surface p-4 hover:border-ink-subtle"
          >
            <Database aria-hidden="true" className="h-5 w-5 text-accent" />
            <span className="mt-2 font-medium text-ink">API documentation</span>
            <span className="text-sm">OpenAPI, with Swagger UI and Redoc.</span>
          </a>
          <Link
            to="/styleguide"
            className="flex flex-col rounded-md border border-border bg-surface p-4 hover:border-ink-subtle"
          >
            <Palette aria-hidden="true" className="h-5 w-5 text-accent" />
            <span className="mt-2 font-medium text-ink">Design system</span>
            <span className="text-sm">Tokens, contrast ratios and components.</span>
          </Link>
        </div>
        <div>
          <Button asChild size="lg">
            <Link to="/configurator">Try it: build a PC</Link>
          </Button>
        </div>
      </Section>
    </article>
  )
}
