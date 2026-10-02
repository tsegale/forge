import { useQueries } from '@tanstack/react-query'
import { ApiError } from '@/api/errors'
import { productQuery } from '@/catalog/queries'
import type { DraftItem } from './draft'

export interface FreshItem extends DraftItem {
  /** The product is no longer sold (it has been withdrawn from the catalog). */
  withdrawn: boolean
}

/**
 * A stored draft can be days old. Re-read each part so prices and stock shown are current;
 * until a part loads, its stored copy is shown.
 */
export function useFreshItems(items: DraftItem[]): FreshItem[] {
  const results = useQueries({
    queries: items.map((item) => productQuery(item.product.slug)),
  })
  return items.map((item, index) => {
    const result = results[index]
    const withdrawn = result?.error instanceof ApiError && result.error.status === 404
    return { product: result?.data ?? item.product, quantity: item.quantity, withdrawn }
  })
}
