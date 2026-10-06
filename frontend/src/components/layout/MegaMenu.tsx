import * as NavigationMenu from '@radix-ui/react-navigation-menu'
import { ChevronDown, Wrench } from 'lucide-react'
import { Link, useMatch } from 'react-router'
import { KindIcon } from '@/catalog/kinds'
import { KIND_LABELS } from '@/catalog/labels'
import { CATEGORY_LINKS } from '@/catalog/navigation'
import { cn } from '@/lib/cn'

const TRIGGER =
  'group inline-flex h-10 items-center gap-1 rounded-md px-3 text-base font-medium text-ink-muted hover:bg-surface-muted hover:text-ink ' +
  'focus-visible:outline-2 focus-visible:outline-accent data-[state=open]:bg-surface-muted data-[state=open]:text-ink'

/**
 * Desktop category navigation: "Shop by category" opens a panel with every kind and its most
 * useful filters, then direct links to the configurator. Radix handles keyboard and focus.
 */
export function MegaMenu() {
  // Radix merges className as a string, so NavLink's className function cannot be used here.
  const building = useMatch('/configurator') !== null
  return (
    <NavigationMenu.Root aria-label="Shop" className="relative">
      <NavigationMenu.List className="flex items-center gap-1">
        <NavigationMenu.Item>
          <NavigationMenu.Trigger className={TRIGGER}>
            Shop by category
            <ChevronDown
              aria-hidden="true"
              className="h-4 w-4 transition-transform duration-150 group-data-[state=open]:rotate-180"
            />
          </NavigationMenu.Trigger>
          <NavigationMenu.Content className="absolute top-0 left-0 w-[min(64rem,calc(100vw-3rem))]">
            <div className="grid grid-cols-[1fr_15rem] overflow-hidden rounded-md border border-border bg-surface shadow-lg">
              <ul className="grid grid-cols-3 gap-x-6 gap-y-5 p-6">
                {CATEGORY_LINKS.map((category) => (
                  <li key={category.kind}>
                    <NavigationMenu.Link asChild>
                      <Link
                        to={`/shop/${category.kind}`}
                        className="group/cat flex items-start gap-2.5 rounded-sm"
                      >
                        <span className="rounded-sm bg-accent-soft p-1.5 text-accent">
                          <KindIcon kind={category.kind} className="h-4 w-4" />
                        </span>
                        <span>
                          <span className="block text-base font-medium text-ink group-hover/cat:text-accent">
                            {KIND_LABELS[category.kind]}
                          </span>
                          <span className="block text-xs text-ink-subtle">{category.blurb}</span>
                        </span>
                      </Link>
                    </NavigationMenu.Link>
                    {category.links.length ? (
                      <ul className="mt-2 space-y-1 pl-9">
                        {category.links.map((link) => (
                          <li key={link.href}>
                            <NavigationMenu.Link asChild>
                              <Link
                                to={link.href}
                                className="text-sm text-ink-muted hover:text-accent hover:underline"
                              >
                                {link.label}
                              </Link>
                            </NavigationMenu.Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
              <div className="flex flex-col border-l border-border bg-canvas p-6">
                <Wrench aria-hidden="true" className="h-5 w-5 text-accent" />
                <p className="mt-3 text-base font-semibold text-ink">Build a PC with confidence</p>
                <p className="mt-1 text-sm text-ink-muted">
                  Every part is checked against the rest of your build as you choose it: socket, memory,
                  clearances and power.
                </p>
                <NavigationMenu.Link asChild>
                  <Link
                    to="/configurator"
                    className="mt-4 inline-flex h-9 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hover"
                  >
                    Open the configurator
                  </Link>
                </NavigationMenu.Link>
              </div>
            </div>
          </NavigationMenu.Content>
        </NavigationMenu.Item>
        {(
          [
            ['cpu', 'Processors'],
            ['gpu', 'Graphics cards'],
            ['motherboard', 'Motherboards'],
            ['memory', 'Memory'],
          ] as const
        ).map(([kind, label]) => (
          <NavigationMenu.Item key={kind} className="hidden xl:block">
            <NavigationMenu.Link asChild>
              <Link to={`/shop/${kind}`} className={TRIGGER}>
                {label}
              </Link>
            </NavigationMenu.Link>
          </NavigationMenu.Item>
        ))}
        <NavigationMenu.Item>
          <NavigationMenu.Link asChild>
            <Link
              to="/configurator"
              aria-current={building ? 'page' : undefined}
              className={cn(TRIGGER, building && 'text-accent hover:text-accent')}
            >
              Build a PC
            </Link>
          </NavigationMenu.Link>
        </NavigationMenu.Item>
      </NavigationMenu.List>
      <div className="absolute top-full left-0 z-50 pt-2">
        <NavigationMenu.Viewport />
      </div>
    </NavigationMenu.Root>
  )
}
