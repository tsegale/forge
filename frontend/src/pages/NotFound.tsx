import { Link } from 'react-router'
import { SearchBox } from '@/components/layout/SearchBox'
import { Button } from '@/components/ui/Button'
import { usePageTitle } from '@/lib/usePageTitle'
import { ErrorPage } from './errors/ErrorPage'

const POPULAR = [
  { label: 'Processors', to: '/shop/cpu' },
  { label: 'Graphics cards', to: '/shop/gpu' },
  { label: 'Motherboards', to: '/shop/motherboard' },
  { label: 'Build a PC', to: '/configurator' },
]

/** A page or product that does not exist: search, or go somewhere useful. */
export function NotFound() {
  usePageTitle('Page not found')
  return (
    <ErrorPage
      code="404"
      title="Page not found"
      actions={
        <Button asChild>
          <Link to="/">Go to the home page</Link>
        </Button>
      }
    >
      <p>The page may have moved, or the part is no longer sold. Search for it instead:</p>
      <SearchBox className="mx-auto mt-5 max-w-md text-left" />
      <nav aria-label="Popular" className="mt-6">
        <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
          {POPULAR.map((link) => (
            <li key={link.to}>
              <Link to={link.to} className="font-medium text-accent hover:underline">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </ErrorPage>
  )
}

/** Signed in, but this area needs a role the account does not have. */
export function Forbidden() {
  usePageTitle('Not available')
  return (
    <ErrorPage
      code="403"
      title="Not available"
      actions={
        <Button asChild variant="secondary">
          <Link to="/">Back to the store</Link>
        </Button>
      }
    >
      <p>This area is for store administrators. If you should have access, ask an administrator.</p>
    </ErrorPage>
  )
}
