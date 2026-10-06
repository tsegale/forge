import { Bell, Layers, LayoutDashboard, MapPin, Package, ShieldCheck } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'
import { useAuth } from '@/auth/context'
import { cn } from '@/lib/cn'

const SECTIONS = [
  { to: '/account', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/orders', label: 'Orders', icon: Package, end: false },
  { to: '/builds', label: 'Saved builds', icon: Layers, end: true },
  { to: '/account/addresses', label: 'Addresses', icon: MapPin, end: true },
  { to: '/account/alerts', label: 'Price alerts', icon: Bell, end: true },
  { to: '/account/profile', label: 'Profile and security', icon: ShieldCheck, end: true },
]

/** The customer's account: one navigation for orders, builds, addresses, alerts and profile. */
export function AccountLayout() {
  const { user } = useAuth()
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <nav aria-label="Account" className="lg:sticky lg:top-28 lg:self-start">
        {user ? (
          <div className="mb-4 hidden lg:block">
            <p className="text-base font-semibold text-ink">
              {user.first_name} {user.last_name}
            </p>
            <p className="truncate text-sm text-ink-subtle">{user.email}</p>
          </div>
        ) : null}
        <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
          {SECTIONS.map(({ to, label, icon: Icon, end }) => (
            <li key={to} className="shrink-0">
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 rounded-md px-3 py-2 text-base whitespace-nowrap',
                    isActive
                      ? 'bg-accent-soft font-medium text-accent'
                      : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
                  )
                }
              >
                <Icon aria-hidden="true" className="h-4 w-4" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  )
}
