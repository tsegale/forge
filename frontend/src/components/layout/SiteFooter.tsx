import { CreditCard, ShieldCheck, Truck } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { KIND_LABELS } from '@/catalog/labels'
import { CATEGORY_LINKS } from '@/catalog/navigation'
import { Logo } from '@/components/ui/Logo'

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <ul className="mt-3 space-y-2 text-base">{children}</ul>
    </div>
  )
}

function FooterLink({
  to,
  children,
  external = false,
}: {
  to: string
  children: ReactNode
  external?: boolean
}) {
  return (
    <li>
      {external ? (
        <a href={to} className="text-ink-muted hover:text-accent hover:underline">
          {children}
        </a>
      ) : (
        <Link to={to} className="text-ink-muted hover:text-accent hover:underline">
          {children}
        </Link>
      )}
    </li>
  )
}

/** Store information, link columns, the trust promises, and the way into the technical side. */
export function SiteFooter({ inspector }: { inspector?: ReactNode }) {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <ul className="grid grid-cols-1 gap-4 border-b border-border py-6 sm:grid-cols-3">
          {(
            [
              [
                ShieldCheck,
                'Compatibility guarantee',
                'Every validated build is checked part against part before it can be ordered.',
              ],
              [
                CreditCard,
                'Secure payment',
                'Card payments are handled by Stripe; card details never reach Forge.',
              ],
              [
                Truck,
                'VAT-inclusive pricing',
                'The price you see includes 15% VAT. Delivery is shown before you pay.',
              ],
            ] as const
          ).map(([Icon, title, text]) => (
            <li key={title} className="flex gap-3">
              <Icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
              <div>
                <p className="text-base font-medium text-ink">{title}</p>
                <p className="text-sm text-ink-muted">{text}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="grid grid-cols-2 gap-8 py-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="inline-flex items-center gap-2 text-accent" aria-label="Forge home">
              <Logo />
              <span className="text-lg font-semibold tracking-tight text-ink">Forge</span>
            </Link>
            <p className="mt-3 max-w-xs text-base text-ink-muted">
              PC components and complete builds, checked for compatibility by a database-enforced engine.
              Windhoek, Namibia.
            </p>
            <p className="mt-3 text-sm text-ink-subtle">
              A demonstration store built for CMP3872 Database Programming at the University of Namibia.
            </p>
          </div>
          <Column title="Shop">
            {CATEGORY_LINKS.slice(0, 6).map((category) => (
              <FooterLink key={category.kind} to={`/?kind=${category.kind}`}>
                {KIND_LABELS[category.kind]}
              </FooterLink>
            ))}
          </Column>
          <Column title="Build and buy">
            <FooterLink to="/configurator">Build a PC</FooterLink>
            <FooterLink to="/builds">Saved builds</FooterLink>
            <FooterLink to="/cart">Cart</FooterLink>
            <FooterLink to="/orders">Orders</FooterLink>
          </Column>
          <Column title="How it works">
            <FooterLink to="/api/docs" external>
              API documentation
            </FooterLink>
            <FooterLink to="/styleguide">Design system</FooterLink>
          </Column>
        </div>

        <div className="flex flex-col gap-3 border-t border-border py-5 text-sm text-ink-subtle sm:flex-row sm:items-center sm:justify-between">
          <p>Prices in Namibian dollars (N$), VAT included.</p>
          {inspector}
        </div>
      </div>
    </footer>
  )
}
