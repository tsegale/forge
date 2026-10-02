/** API-shaped test data, typed against the generated schema so fixtures cannot drift from it. */
import type { components } from '@/api/schema'

type ProductSummary = components['schemas']['ProductSummary']

export const nad = (amount_cents: number) => ({ amount_cents, currency: 'nad' })

export function cpu(overrides: Partial<ProductSummary> = {}): ProductSummary {
  return {
    id: 1,
    sku: 'FRG-CPU-R7-7800X3D',
    slug: 'amd-ryzen-7-7800x3d',
    name: 'AMD Ryzen 7 7800X3D',
    kind: 'cpu',
    brand: { id: 1, name: 'AMD', slug: 'amd' },
    price: nad(799_900),
    availability: { in_stock: true, quantity_available: 25 },
    specs: {
      kind: 'cpu',
      socket_code: 'AM5',
      cores: 8,
      threads: 16,
      base_clock_mhz: 4200,
      boost_clock_mhz: 5000,
      tdp_w: 120,
      max_power_w: 162,
      has_integrated_graphics: true,
      includes_cooler: false,
    },
    compatibility_warnings: null,
    ...overrides,
  }
}

export const kinds = {
  items: [
    { code: 'cpu', label: 'CPU', max_per_build: 1, required_in_build: true, sort_order: 10 },
    { code: 'gpu', label: 'Graphics card', max_per_build: 2, required_in_build: false, sort_order: 40 },
  ],
}
