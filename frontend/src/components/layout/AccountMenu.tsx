import * as Menu from '@radix-ui/react-dropdown-menu'
import { ChevronDown, CircleUser } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '@/auth/context'

const ITEM = 'cursor-pointer rounded-sm px-3 py-2 text-sm text-ink outline-none data-[highlighted]:bg-canvas'

export function AccountMenu() {
  const { status, user, logout } = useAuth()
  const navigate = useNavigate()
  if (status === 'loading') return null
  if (!user) {
    return (
      <Link
        to="/login"
        className="rounded-md px-3 py-2 text-sm font-medium text-ink-muted hover:bg-canvas hover:text-ink"
      >
        Sign in
      </Link>
    )
  }
  return (
    <Menu.Root>
      <Menu.Trigger className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-ink hover:bg-canvas">
        <CircleUser aria-hidden="true" className="h-4 w-4" />
        {user.first_name}
        <ChevronDown aria-hidden="true" className="h-4 w-4 text-ink-subtle" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-48 rounded-md border border-border bg-surface p-1 shadow-md"
        >
          <Menu.Label className="px-3 py-2 text-xs text-ink-subtle">{user.email}</Menu.Label>
          <Menu.Item className={ITEM} onSelect={() => void navigate('/orders')}>
            My orders
          </Menu.Item>
          <Menu.Item className={ITEM} onSelect={() => void navigate('/builds')}>
            My builds
          </Menu.Item>
          {user.role === 'admin' ? (
            <Menu.Item className={ITEM} onSelect={() => void navigate('/admin/orders')}>
              Administration
            </Menu.Item>
          ) : null}
          <Menu.Separator className="my-1 h-px bg-border" />
          <Menu.Item
            className={ITEM}
            onSelect={() => {
              void logout().then(() => navigate('/'))
            }}
          >
            Sign out
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}
