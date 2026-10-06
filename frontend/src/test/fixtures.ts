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
    compatibility: null,
    ...overrides,
  }
}

export const kinds = {
  items: [
    { code: 'cpu', label: 'CPU', max_per_build: 1, required_in_build: true, sort_order: 10 },
    { code: 'gpu', label: 'Graphics card', max_per_build: 2, required_in_build: false, sort_order: 40 },
  ],
}

export function psu(overrides: Partial<ProductSummary> = {}): ProductSummary {
  return {
    id: 6,
    sku: 'FRG-PSU-RM750E',
    slug: 'corsair-rm750e',
    name: 'Corsair RM750e',
    kind: 'psu',
    brand: { id: 4, name: 'Corsair', slug: 'corsair' },
    price: nad(189_900),
    availability: { in_stock: true, quantity_available: 12 },
    specs: {
      kind: 'psu',
      wattage_w: 750,
      efficiency: '80plus_gold',
      form_factor: 'atx',
      modularity: 'fully_modular',
      has_12v_2x6: true,
      atx_version: '3.1',
    },
    compatibility_warnings: null,
    compatibility: null,
    ...overrides,
  }
}

export const customer = {
  id: 1,
  email: 'ada@example.com',
  first_name: 'Ada',
  last_name: 'L',
  role: 'customer',
  created_at: '2026-10-01T00:00:00Z',
}

/** An unfinished build's compatibility report: nothing conflicts, parts still missing. */
export function report(overrides: Partial<components['schemas']['CompatibilityReport']> = {}) {
  return {
    compatible: true,
    complete: false,
    conflicts: [],
    warnings: [],
    missing_kinds: ['gpu'],
    power: { sustained_w: 192, peak_w: 192, recommended_psu_w: 250 },
    ...overrides,
  }
}

type Cart = components['schemas']['CartResponse']
type OrderDetail = components['schemas']['OrderDetail']

export const totals = (total: number) => ({
  subtotal: nad(Math.round((total - 15_000) / 1.15)),
  shipping: nad(13_043),
  tax: nad(total - Math.round((total - 15_000) / 1.15) - 13_043),
  total: nad(total),
})

export function cartWith(quantity = 1, overrides: Partial<Cart['items'][number]> = {}): Cart {
  const product = cpu()
  return {
    items: [
      {
        id: 31,
        quantity,
        line_total: nad(product.price.amount_cents * quantity),
        in_stock: true,
        product,
        ...overrides,
      },
    ],
    item_count: quantity,
    totals: totals(product.price.amount_cents * quantity + 15_000),
  }
}

export const emptyCart: Cart = { items: [], item_count: 0, totals: totals(15_000) }

export function order(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    order_number: 'FRG-000042',
    status: 'pending_payment',
    items: [
      {
        product_id: 1,
        sku: 'FRG-CPU-R7-7800X3D',
        name: 'AMD Ryzen 7 7800X3D',
        quantity: 1,
        unit_price: nad(799_900),
        line_total: nad(799_900),
      },
    ],
    totals: totals(814_900),
    shipping_address: {
      recipient_name: 'Ada Lovelace',
      phone: null,
      line1: '12 Independence Avenue',
      line2: null,
      city: 'Windhoek',
      region: null,
      postal_code: null,
      country_code: 'NA',
    },
    build_id: null,
    reservation_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    created_at: '2026-10-02T10:00:00Z',
    payment_status: 'requires_payment',
    history: [{ from_status: null, to_status: 'pending_payment', at: '2026-10-02T10:00:00Z' }],
    ...overrides,
  }
}

export const storeConfig = {
  currency: 'nad',
  vat_rate_bps: 1500,
  shipping: { flat_cents: 15_000, free_threshold_cents: 500_000 },
  reservation_ttl_seconds: 900,
  payment_provider: 'stripe' as const,
  stripe_publishable_key: 'pk_test_example',
}

export const apiError = (code: string, message: string, details: unknown = null) => ({
  error: { code, message, details, request_id: 'req-1' },
})
