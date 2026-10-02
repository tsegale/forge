import { describe, expect, it } from 'vitest'
import { queryFromSearch } from './filters'

describe('queryFromSearch', () => {
  it('converts types and keeps only known parameters', () => {
    const query = queryFromSearch(
      new URLSearchParams('kind=cpu&cores_min=8&has_integrated_graphics=false&evil=1&q=x3d'),
    )
    expect(query).toEqual({ kind: 'cpu', cores_min: 8, has_integrated_graphics: false, q: 'x3d' })
  })

  it('drops spec filters without a kind instead of sending a request the API rejects', () => {
    expect(queryFromSearch(new URLSearchParams('socket=AM5&in_stock=true'))).toEqual({ in_stock: true })
  })

  it('splits brands into a list', () => {
    expect(queryFromSearch(new URLSearchParams('brand=amd,intel'))).toEqual({ brand: ['amd', 'intel'] })
  })
})
