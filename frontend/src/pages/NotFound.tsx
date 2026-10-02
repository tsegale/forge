import { Link } from 'react-router'

export function NotFound() {
  return (
    <section className="py-16 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 text-ink-muted">The page you asked for does not exist.</p>
      <Link to="/" className="mt-6 inline-block font-medium text-accent hover:text-accent-hover">
        Back to the catalog
      </Link>
    </section>
  )
}
