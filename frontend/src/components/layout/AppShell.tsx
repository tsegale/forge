import { NavLink, Outlet } from 'react-router'
import { Logo } from '@/components/ui/Logo'
import { AccountMenu } from './AccountMenu'
import { CartLink } from './CartLink'

const NAV = [
  { to: '/', label: 'Catalog', end: true },
  { to: '/configurator', label: 'Build a PC', end: false },
  { to: '/orders', label: 'Orders', end: false },
] as const

function navClass({ isActive }: { isActive: boolean }) {
  return `rounded-md px-3 py-2 text-sm font-medium ${
    isActive ? 'bg-accent-soft text-accent' : 'text-ink-muted hover:bg-canvas hover:text-ink'
  }`
}

export function AppShell() {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:rounded focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-8 px-6">
          <NavLink to="/" className="flex items-center gap-2 text-accent" aria-label="Forge home">
            <Logo />
            <span className="text-lg font-semibold tracking-tight text-ink">Forge</span>
          </NavLink>
          <nav aria-label="Main" className="flex items-center gap-1">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={navClass}>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <CartLink />
            <AccountMenu />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-border bg-surface">
        <div className="mx-auto max-w-7xl px-6 py-4 text-xs text-ink-subtle">
          Forge. Prices in Namibian dollars, VAT included.
        </div>
      </footer>
    </div>
  )
}
