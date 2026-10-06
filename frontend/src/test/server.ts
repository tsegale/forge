/**
 * Mock Service Worker for unit tests: real fetch calls, answered by handlers declared per test.
 * The defaults below answer what every page asks for (store settings, an empty cart, component
 * kinds, catalog facets, search suggestions), so a test only declares what it is about. Tests override them.
 */
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { emptyCart, facets, kinds, storeConfig } from './fixtures'

export const defaultHandlers = [
  http.get('/api/v1/config', () => HttpResponse.json(storeConfig)),
  http.get('/api/v1/cart', () => HttpResponse.json(emptyCart)),
  http.get('/api/v1/component-kinds', () => HttpResponse.json(kinds)),
  http.get('/api/v1/products/facets', () => HttpResponse.json(facets())),
  http.get('/api/v1/products/price-drops', () => HttpResponse.json({ items: [] })),
  http.get('/api/v1/products/back-in-stock', () => HttpResponse.json({ items: [] })),
  http.get('/api/v1/builds/featured', () => HttpResponse.json({ items: [] })),
  http.get('/api/v1/search/suggest', ({ request }) =>
    HttpResponse.json({
      query: new URL(request.url).searchParams.get('q') ?? '',
      total: 0,
      groups: [],
      did_you_mean: null,
    }),
  ),
]

export const server = setupServer(...defaultHandlers)
