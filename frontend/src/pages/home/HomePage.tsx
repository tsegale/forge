import { useQuery } from '@tanstack/react-query'
import { ArrowRight, CircleCheck, Cpu, Gauge, Ruler, ShieldCheck, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { configQuery } from '@/app/config'
import { emptyDraft } from '@/builds/draft'
import { setDraft } from '@/builds/store'
import { KIND_LABELS } from '@/catalog/labels'
import { CATEGORY_LINKS } from '@/catalog/navigation'
import { facetsQuery } from '@/catalog/queries'
import { KindIllustration } from '@/components/catalog/KindIllustration'
import { ProductCard, ProductCardSkeleton } from '@/components/catalog/ProductCard'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { toast } from '@/components/ui/toastStore'
import { backInStockQuery, featuredBuildsQuery, priceDropsQuery, type FeaturedBuild } from '@/home/queries'
import { formatPrice } from '@/lib/money'
import { usePageTitle } from '@/lib/usePageTitle'

const SHORT_KIND: Record<string, string> = { cpu: 'CPU', gpu: 'GPU', memory: 'Memory', case: 'Case' }
const RELATIVE = new Intl.RelativeTimeFormat('en-GB', { numeric: 'auto' })

function daysAgo(iso: string): string {
  const days = Math.round((Date.parse(iso) - Date.now()) / 86_400_000)
  return RELATIVE.format(days, 'day')
}

function Section({
  id,
  title,
  intro,
  link,
  children,
}: {
  id: string
  title: string
  intro?: string
  link?: { to: string; label: string }
  children: ReactNode
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id={id} className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            {title}
          </h2>
          {intro ? <p className="mt-1 text-base text-ink-muted">{intro}</p> : null}
        </div>
        {link ? (
          <Link
            to={link.to}
            className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
          >
            {link.label} <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  )
}

/** A still of what the engine does: the kind of check every build gets, written as the UI shows it. */
function LiveCheck() {
  const checks = [
    { icon: Cpu, label: 'Socket', text: 'AM5 processor, AM5 board', ok: true },
    { icon: Ruler, label: 'Clearance', text: 'Card 336 mm, case fits 355 mm', ok: true },
    { icon: Gauge, label: 'Power', text: '640 W peak on an 850 W supply', ok: true },
    {
      icon: TriangleAlert,
      label: 'Memory',
      text: 'Two different kits: may not run at rated speed',
      ok: false,
    },
  ]
  return (
    <div aria-hidden="true" className="rounded-md border border-border bg-surface p-5 shadow-sm">
      <p className="flex items-center gap-2 text-sm font-semibold text-success-ink">
        <CircleCheck className="h-4 w-4" /> Compatible, 1 note
      </p>
      <ul className="mt-4 flex flex-col gap-3">
        {checks.map(({ icon: Icon, label, text, ok }) => (
          <li key={label} className="flex items-start gap-3">
            <span
              className={
                ok
                  ? 'flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-success-soft text-success-ink'
                  : 'flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-warning-soft text-warning-ink'
              }
            >
              <Icon className="h-4 w-4" />
            </span>
            <span className="text-sm">
              <span className="block font-medium text-ink">{label}</span>
              <span className="block font-tech text-xs text-ink-muted">{text}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function FeaturedBuildCard({ build }: { build: FeaturedBuild }) {
  const navigate = useNavigate()
  const parts = build.items.map((item) => item.product)
  const highlight = ['cpu', 'gpu', 'memory', 'case']
    .map((kind) => parts.find((p) => p.kind === kind))
    .filter((p) => p !== undefined)
  return (
    <article className="flex flex-col rounded-md border border-border bg-surface p-5">
      <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-success-ink uppercase">
        <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" /> Validated
      </p>
      <h3 className="mt-2 text-lg font-semibold text-ink">{build.name}</h3>
      {build.blurb ? <p className="mt-1 text-sm text-ink-muted">{build.blurb}</p> : null}
      <ul className="mt-4 flex flex-col gap-1.5 text-sm" aria-label={`Key parts of ${build.name}`}>
        {highlight.map((p) => (
          <li key={p.id} className="flex gap-2">
            <span className="w-16 shrink-0 text-ink-subtle">{SHORT_KIND[p.kind] ?? p.kind}</span>
            <span className="min-w-0 truncate text-ink">{p.name}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm text-ink-subtle">{build.item_count} parts in total</p>
      <div className="mt-auto flex items-end justify-between gap-3 pt-5">
        <div>
          <p className="text-xs text-ink-subtle">Parts total</p>
          <p className="text-xl font-semibold text-ink tabular">{formatPrice(build.subtotal)}</p>
        </div>
        <Button
          aria-label={`Open ${build.name} in the configurator`}
          onClick={() => {
            setDraft({
              ...emptyDraft(),
              name: build.name,
              items: build.items.map((item) => ({ product: item.product, quantity: item.quantity })),
            })
            toast({
              title: `${build.name} is in your configurator`,
              description: 'Change any part; it is checked again.',
            })
            void navigate('/configurator')
          }}
        >
          Customise
        </Button>
      </div>
    </article>
  )
}

/** The store front: what Forge does differently, then builds, categories, deals and restocks. */
export function HomePage() {
  usePageTitle(undefined)
  const kinds = useQuery(facetsQuery({}))
  const featured = useQuery(featuredBuildsQuery)
  const drops = useQuery(priceDropsQuery)
  const restocks = useQuery(backInStockQuery)
  const config = useQuery(configQuery)
  const counts = new Map((kinds.data?.kinds ?? []).map((k) => [k.kind, k.count]))
  const holdMinutes = config.data ? Math.round(config.data.reservation_ttl_seconds / 60) : null

  return (
    <div className="flex flex-col gap-16">
      <section
        aria-labelledby="hero-heading"
        className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,1fr)_26rem]"
      >
        <div>
          <p className="text-sm font-semibold tracking-wide text-accent uppercase">
            PC components, checked part against part
          </p>
          <h1
            id="hero-heading"
            className="mt-3 text-4xl leading-tight font-semibold tracking-tight text-ink sm:text-5xl"
          >
            Build a PC that works the first time.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-ink-muted">
            Every part you add is checked against the rest of the build: socket, memory, size, cooling and
            power, with the measurements behind each verdict. An incompatible build cannot be ordered.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/configurator">Start a build</Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link to="/shop">Shop components</Link>
            </Button>
          </div>
        </div>
        <LiveCheck />
      </section>

      <Section
        id="builds-heading"
        title="Start from a validated build"
        intro="Picked by Forge, checked by the engine. Change any part."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {featured.data
            ? featured.data.items.map((build) => <FeaturedBuildCard key={build.id} build={build} />)
            : Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-80 w-full" />)}
        </div>
      </Section>

      <Section id="categories-heading" title="Shop by category">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {CATEGORY_LINKS.filter((c) => c.kind !== 'accessory').map((category) => (
            <li key={category.kind}>
              <Link
                to={`/shop/${category.kind}`}
                className="group flex h-full flex-col rounded-md border border-border bg-surface p-4 hover:border-ink-subtle"
              >
                <span className="block h-20 text-ink-subtle group-hover:text-accent" aria-hidden="true">
                  <KindIllustration kind={category.kind} label="" />
                </span>
                <span className="mt-3 font-medium text-ink">{KIND_LABELS[category.kind]}</span>
                <span className="text-sm text-ink-subtle">
                  {counts.has(category.kind) ? `${String(counts.get(category.kind))} parts` : category.blurb}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      {drops.data?.items.length !== 0 ? (
        <Section
          id="drops-heading"
          title="Price drops"
          intro="Cut in the last 30 days, from our own price history."
          link={{ to: '/shop', label: 'All components' }}
        >
          <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {drops.data
              ? drops.data.items.slice(0, 4).map((drop) => (
                  <li key={drop.product.id} className="grid min-w-0">
                    <ProductCard
                      product={{ ...drop.product, was_price: drop.was }}
                      note={
                        <p className="text-sm font-medium text-success-ink">
                          {drop.percent_off}% off, {daysAgo(drop.dropped_at)}
                        </p>
                      }
                    />
                  </li>
                ))
              : Array.from({ length: 4 }, (_, i) => (
                  <li key={i} aria-hidden="true">
                    <ProductCardSkeleton />
                  </li>
                ))}
          </ul>
        </Section>
      ) : null}

      {restocks.data?.items.length ? (
        <Section id="restock-heading" title="Back in stock" intro="Sold out, now available again.">
          <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {restocks.data.items.map((item) => (
              <li key={item.product.id} className="grid min-w-0">
                <ProductCard
                  product={item.product}
                  note={<p className="text-sm text-ink-muted">Restocked {daysAgo(item.restocked_at)}</p>}
                />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section id="how-heading" title="How Forge works" link={{ to: '/how-it-works', label: 'The details' }}>
        <ol className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            [
              'Choose parts',
              'Pick from the catalog or start from a validated build. Each pick lists only parts that fit.',
            ],
            [
              'The engine checks',
              'Rules for socket, memory, size, cooling and power run on every change, in the database too.',
            ],
            [
              'Pay with stock held',
              `Checkout reserves every part${holdMinutes === null ? '' : ` for ${String(holdMinutes)} minutes`} while you pay, so nothing sells out mid-payment.`,
            ],
          ].map(([title, text], index) => (
            <li key={title} className="rounded-md border border-border bg-surface p-5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft font-tech text-sm font-semibold text-accent">
                {index + 1}
              </span>
              <h3 className="mt-3 font-semibold text-ink">{title}</h3>
              <p className="mt-1 text-sm text-ink-muted">{text}</p>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  )
}
