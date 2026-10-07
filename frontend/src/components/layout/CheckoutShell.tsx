import { ChevronLeft, Lock } from 'lucide-react'
import { Link, Outlet } from 'react-router'
import { ApiInspector, InspectorToggle } from '@/components/inspector/ApiInspector'
import { Logo } from '@/components/ui/Logo'
import { Toaster } from '@/components/ui/Toast'

const CONTAINER = 'mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8'

/**
 * The frame for checkout, payment and confirmation: no navigation, search or promotions to pull
 * the customer away mid-purchase, just the store mark, a way back to the cart and the reassurance.
 */
export function CheckoutShell() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:shadow-md"
      >
        Skip to content
      </a>
      <header className="border-b border-border bg-surface">
        <div className={`${CONTAINER} flex h-16 items-center justify-between gap-4`}>
          <Link to="/" className="flex items-center gap-2 text-accent" aria-label="Forge home">
            <Logo />
            <span className="text-xl font-semibold tracking-tight text-ink">Forge</span>
          </Link>
          <p className="flex items-center gap-1.5 text-sm font-medium text-ink-muted">
            <Lock aria-hidden="true" className="h-4 w-4 text-success-ink" />
            Secure checkout
          </p>
        </div>
      </header>
      <main id="main" tabIndex={-1} className={`${CONTAINER} flex-1 py-8 focus:outline-none`}>
        <Outlet />
      </main>
      <footer className="border-t border-border bg-surface">
        <div
          className={`${CONTAINER} flex flex-col gap-2 py-5 text-sm text-ink-subtle sm:flex-row sm:items-center sm:justify-between`}
        >
          <Link to="/shop" className="inline-flex items-center gap-1 text-ink-muted hover:text-accent">
            <ChevronLeft aria-hidden="true" className="h-4 w-4" /> Return to the store
          </Link>
          <p>Prices in Namibian dollars (N$), VAT included. Card payments are handled by Stripe.</p>
          <InspectorToggle />
        </div>
      </footer>
      <ApiInspector />
      <Toaster />
    </div>
  )
}
