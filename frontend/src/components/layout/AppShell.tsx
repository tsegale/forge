import { Layers } from 'lucide-react'
import { Link, Outlet, useMatches } from 'react-router'
import { useAuth } from '@/auth/context'
import { ApiInspector, InspectorToggle } from '@/components/inspector/ApiInspector'
import { Logo } from '@/components/ui/Logo'
import { Toaster } from '@/components/ui/Toast'
import { AccountMenu } from './AccountMenu'
import { AnnouncementBar } from './AnnouncementBar'
import { CartLink } from './CartLink'
import { MegaMenu } from './MegaMenu'
import { MiniCart } from './MiniCart'
import { MobileMenu } from './MobileMenu'
import { SearchBox } from './SearchBox'
import { SiteFooter } from './SiteFooter'

export const CONTAINER = 'mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8'

/** A route opts out of the page container with `handle: { fullBleed: true }` and lays out its own. */
function useFullBleed(): boolean {
  return useMatches().some(
    (match) => (match.handle as { fullBleed?: boolean } | undefined)?.fullBleed === true,
  )
}

/** The store frame: announcement bar, header (search, account, cart), page, footer. */
export function AppShell() {
  const { user } = useAuth()
  const fullBleed = useFullBleed()
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:shadow-md"
      >
        Skip to content
      </a>
      <AnnouncementBar />
      <header className="sticky top-0 z-30 border-b border-border bg-surface">
        <div className={`${CONTAINER} flex h-16 items-center gap-3 lg:gap-6`}>
          <MobileMenu />
          <Link to="/" className="flex shrink-0 items-center" aria-label="Forge home">
            <Logo />
          </Link>
          <SearchBox className="hidden flex-1 md:block lg:max-w-xl" />
          <div className="ml-auto flex items-center gap-1">
            {user ? (
              <Link
                to="/builds"
                aria-label="Saved builds"
                title="Saved builds"
                className="hidden h-10 w-10 items-center justify-center rounded-md text-ink-muted hover:bg-surface-muted hover:text-ink sm:inline-flex"
              >
                <Layers aria-hidden="true" className="h-5 w-5" />
              </Link>
            ) : null}
            <AccountMenu />
            <CartLink />
          </div>
        </div>
        <div className={`${CONTAINER} pb-3 md:hidden`}>
          <SearchBox />
        </div>
        <div className="hidden border-t border-border lg:block">
          <div className={`${CONTAINER} flex h-12 items-center`}>
            <MegaMenu />
          </div>
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className={
          fullBleed ? 'flex-1 pb-8 focus:outline-none' : `${CONTAINER} flex-1 py-8 focus:outline-none`
        }
      >
        <Outlet />
      </main>
      <SiteFooter inspector={<InspectorToggle />} />
      <MiniCart />
      <ApiInspector />
      <Toaster />
    </div>
  )
}
