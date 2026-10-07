import { useEffect } from 'react'

const SITE = 'Forge'

/** The document title for this page, "Processors | Forge", so tabs, history and screen readers name it. */
export function usePageTitle(title: string | undefined): void {
  useEffect(() => {
    document.title = title ? `${title} | ${SITE}` : SITE
  }, [title])
}
