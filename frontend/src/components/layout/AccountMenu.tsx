import * as Menu from '@radix-ui/react-dropdown-menu'
import { ChevronDown, CircleUser, Layers, LogOut, Package, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '@/auth/context'

const ITEM =
  'flex cursor-pointer items-center gap-2.5 rounded-sm px-2.5 py-2 text-base text-ink outline-none ' +
  'data-[highlighted]:bg-surface-muted [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-ink-subtle'

function Item({ children, onSelect }: { children: ReactNode; onSelect: () => void }) {
  return (
    <Menu.Item className={ITEM} onSelect={onSelect}>
      {children}
    </Menu.Item>
  )
}

/** Sign in, or the signed-in customer's menu: orders, builds, administration, sign out. */
export function AccountMenu() {
  const { status, user, logout } = useAuth()
  const navigate = useNavigate()
  if (status === 'loading') return <span aria-hidden="true" className="h-10 w-24" />
  if (!user) {
    return (
      <Link
        to="/login"
        className="inline-flex h-10 items-center gap-2 rounded-md px-3 text-base font-medium text-ink-muted hover:bg-surface-muted hover:text-ink"
      >
        <CircleUser aria-hidden="true" className="h-5 w-5" />
        <span className="sr-only sm:not-sr-only">Sign in</span>
      </Link>
    )
  }
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={`Account: ${user.first_name}`}
        className="inline-flex h-10 items-center gap-2 rounded-md px-2.5 text-base font-medium text-ink hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-accent data-[state=open]:bg-surface-muted"
      >
        <span
          aria-hidden="true"
          className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent"
        >
          {user.first_name.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden max-w-32 truncate lg:inline">{user.first_name}</span>
        <ChevronDown aria-hidden="true" className="hidden h-4 w-4 text-ink-subtle lg:block" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={6}
          className="z-50 w-60 rounded-md border border-border bg-surface p-1.5 shadow-lg"
        >
          <Menu.Label className="px-2.5 pt-1.5 pb-2">
            <span className="block text-base font-medium text-ink">
              {user.first_name} {user.last_name}
            </span>
            <span className="block truncate text-sm text-ink-subtle">{user.email}</span>
          </Menu.Label>
          <Menu.Separator className="my-1 h-px bg-border" />
          <Item onSelect={() => void navigate('/orders')}>
            <Package aria-hidden="true" /> Orders
          </Item>
          <Item onSelect={() => void navigate('/builds')}>
            <Layers aria-hidden="true" /> Saved builds
          </Item>
          {user.role === 'admin' ? (
            <Item onSelect={() => void navigate('/admin/orders')}>
              <ShieldCheck aria-hidden="true" /> Administration
            </Item>
          ) : null}
          <Menu.Separator className="my-1 h-px bg-border" />
          <Item
            onSelect={() => {
              void logout().then(() => navigate('/'))
            }}
          >
            <LogOut aria-hidden="true" /> Sign out
          </Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}
