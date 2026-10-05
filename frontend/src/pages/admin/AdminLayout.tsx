import { NavLink, Outlet } from 'react-router'

const LINKS = [
  { to: '/admin/orders', label: 'Orders' },
  { to: '/admin/inventory', label: 'Inventory' },
] as const

/** Administration area: its own section navigation above each admin screen. */
export function AdminLayout() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-6 border-b border-border">
        <p className="pb-3 text-xs font-semibold tracking-wide text-ink-subtle uppercase">Administration</p>
        <nav aria-label="Administration" className="flex gap-1">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `-mb-px border-b-2 px-3 pb-3 text-sm font-medium ${
                  isActive ? 'border-accent text-accent' : 'border-transparent text-ink-muted hover:text-ink'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <Outlet />
    </div>
  )
}
