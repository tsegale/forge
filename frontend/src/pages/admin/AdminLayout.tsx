import { Boxes, History, LayoutDashboard, Package, Webhook } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'
import { cn } from '@/lib/cn'

const LINKS = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/orders', label: 'Orders', icon: Package },
  { to: '/admin/inventory', label: 'Inventory', icon: Boxes },
  { to: '/admin/audit', label: 'Audit log', icon: History },
  { to: '/admin/webhooks', label: 'Webhooks', icon: Webhook },
] as const

/** The back office: one navigation for the dashboard, orders, stock and the logs. */
export function AdminLayout() {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <nav aria-label="Administration" className="min-w-0 lg:sticky lg:top-28 lg:self-start">
        <p className="mb-3 hidden text-xs font-semibold tracking-wide text-ink-subtle uppercase lg:block">
          Back office
        </p>
        <ul className="relative -mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
          {LINKS.map(({ to, label, icon: Icon }) => (
            <li key={to} className="shrink-0">
              <NavLink
                to={to}
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
