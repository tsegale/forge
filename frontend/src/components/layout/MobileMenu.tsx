import { Menu as MenuIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '@/auth/context'
import { KindIcon } from '@/catalog/kinds'
import { KIND_LABELS } from '@/catalog/labels'
import { CATEGORY_LINKS } from '@/catalog/navigation'
import { IconButton } from '@/components/ui/Button'
import { Drawer } from '@/components/ui/Dialog'

const ROW = 'flex items-center gap-3 rounded-md px-2 py-2.5 text-base text-ink hover:bg-surface-muted'

/** Navigation for small screens: categories, the configurator and account links in a drawer. */
export function MobileMenu() {
  const [open, setOpen] = useState(false)
  const { user } = useAuth()

  return (
    <>
      <IconButton
        label="Menu"
        className="lg:hidden"
        onClick={() => {
          setOpen(true)
        }}
      >
        <MenuIcon aria-hidden="true" className="h-5 w-5" />
      </IconButton>
      <Drawer open={open} onOpenChange={setOpen} title="Menu" width="sm">
        <nav
          aria-label="Mobile"
          onClick={(event) => {
            // Any link closes the menu as it navigates.
            if ((event.target as HTMLElement).closest('a')) setOpen(false)
          }}
        >
          <Link
            to="/configurator"
            className="mb-4 flex h-11 items-center justify-center rounded-md bg-accent text-base font-medium text-white"
          >
            Build a PC
          </Link>
          <p className="px-2 text-xs font-semibold tracking-wide text-ink-subtle uppercase">
            Shop by category
          </p>
          <ul className="mt-1">
            {CATEGORY_LINKS.map((category) => (
              <li key={category.kind}>
                <Link to={`/shop/${category.kind}`} className={ROW}>
                  <KindIcon kind={category.kind} className="h-4 w-4 text-ink-subtle" />
                  {KIND_LABELS[category.kind]}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-5 px-2 text-xs font-semibold tracking-wide text-ink-subtle uppercase">Account</p>
          <ul className="mt-1">
            {user ? (
              <>
                <li>
                  <Link to="/account" className={ROW}>
                    Your account
                  </Link>
                </li>
                <li>
                  <Link to="/orders" className={ROW}>
                    Orders
                  </Link>
                </li>
                <li>
                  <Link to="/builds" className={ROW}>
                    Saved builds
                  </Link>
                </li>
                {user.role === 'admin' ? (
                  <li>
                    <Link to="/admin/orders" className={ROW}>
                      Administration
                    </Link>
                  </li>
                ) : null}
              </>
            ) : (
              <li>
                <Link to="/login" className={ROW}>
                  Sign in or create an account
                </Link>
              </li>
            )}
          </ul>
        </nav>
      </Drawer>
    </>
  )
}
