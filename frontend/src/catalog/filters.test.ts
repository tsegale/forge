import { describe, expect, it } from 'vitest'
import { filterValueLabel, queryFromSearch, SPEC_FILTERS } from './filters'

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

  it('takes the kind from the path, and drops filters that belong to another kind', () => {
    expect(queryFromSearch(new URLSearchParams('kind=gpu&socket=AM5&vram_min_gb=12'), 'cpu')).toEqual({
      kind: 'cpu',
      socket: 'AM5',
    })
  })

  it('ignores an unknown kind and a malformed price', () => {
    expect(queryFromSearch(new URLSearchParams('min_price=abc&max_price=500000'), 'toaster')).toEqual({
      max_price: 500000,
    })
  })

  it('drops relevance sorting without a search', () => {
    expect(queryFromSearch(new URLSearchParams('sort=relevance'))).toEqual({})
  })
})

describe('filterValueLabel', () => {
  it('reads like the control that set it', () => {
    const [socket, cores, igpu] = SPEC_FILTERS.cpu ?? []
    if (!socket || !cores || !igpu) throw new Error('cpu filters missing')
    expect(filterValueLabel(socket, 'AM5')).toBe('AM5')
    expect(filterValueLabel(cores, '8')).toBe('8 cores')
    expect(filterValueLabel(igpu, 'false')).toBe('No')
  })
})
