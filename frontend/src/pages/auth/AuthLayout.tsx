import { History, Layers, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'

const BENEFITS = [
  {
    icon: Layers,
    title: 'Save your builds',
    text: 'Keep configurations and come back to them on any device.',
  },
  {
    icon: ShieldCheck,
    title: 'Checked before you pay',
    text: 'Every build is validated part against part before checkout.',
  },
  {
    icon: History,
    title: 'Orders in one place',
    text: 'Follow each order from payment to delivery, and buy again.',
  },
]

/** Sign in, registration and password reset: the form, and on wide screens why an account helps. */
export function AuthLayout({
  title,
  intro,
  children,
}: {
  title: string
  intro?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="mx-auto grid max-w-5xl grid-cols-1 overflow-hidden rounded-md border border-border bg-surface lg:grid-cols-[minmax(0,1fr)_24rem]">
      <section aria-labelledby="auth-heading" className="px-6 py-10 sm:px-12 sm:py-14">
        <div className="mx-auto max-w-sm">
          <h1 id="auth-heading" className="text-2xl font-semibold tracking-tight text-ink">
            {title}
          </h1>
          {intro ? <div className="mt-2 text-base text-ink-muted">{intro}</div> : null}
          <div className="mt-8">{children}</div>
        </div>
      </section>
      <aside aria-label="Why create an account" className="hidden bg-ink px-10 py-14 text-white lg:block">
        <p className="text-sm font-semibold tracking-wide text-white/70 uppercase">Your Forge account</p>
        <ul className="mt-6 flex flex-col gap-6">
          {BENEFITS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-3">
              <Icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-white/80" />
              <div>
                <p className="font-medium">{title}</p>
                <p className="text-sm text-white/75">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  )
}
