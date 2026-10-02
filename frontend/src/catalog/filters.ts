import type { components } from '@/api/schema'

export type ProductQuery = components['schemas']['ProductQuery']
type FilterKey = Exclude<
  keyof ProductQuery,
  | 'q'
  | 'kind'
  | 'category'
  | 'brand'
  | 'sort'
  | 'limit'
  | 'cursor'
  | 'compatible_with'
  | 'min_price'
  | 'max_price'
  | 'in_stock'
>

export type FilterDef =
  | { key: FilterKey; label: string; type: 'select'; options: { value: string; label: string }[] }
  | { key: FilterKey; label: string; type: 'number'; unit: string }
  | { key: FilterKey; label: string; type: 'boolean' }

const SOCKETS = ['AM4', 'AM5', 'LGA1700', 'LGA1851'].map((s) => ({ value: s, label: s }))
const MEMORY = [
  { value: 'ddr4', label: 'DDR4' },
  { value: 'ddr5', label: 'DDR5' },
]

/**
 * Spec filters per kind, mirroring the backend's ProductQuery (keys are type-checked against the
 * generated schema, so a renamed backend parameter breaks the build here).
 */
export const SPEC_FILTERS: Record<string, FilterDef[]> = {
  cpu: [
    { key: 'socket', label: 'Socket', type: 'select', options: SOCKETS },
    { key: 'cores_min', label: 'Cores, at least', type: 'number', unit: 'cores' },
    { key: 'has_integrated_graphics', label: 'Integrated graphics', type: 'boolean' },
  ],
  motherboard: [
    { key: 'socket', label: 'Socket', type: 'select', options: SOCKETS },
    { key: 'memory_type', label: 'Memory type', type: 'select', options: MEMORY },
    {
      key: 'form_factor',
      label: 'Form factor',
      type: 'select',
      options: ['ATX', 'Micro-ATX', 'Mini-ITX'].map((f) => ({ value: f, label: f })),
    },
  ],
  memory: [
    { key: 'memory_type', label: 'Memory type', type: 'select', options: MEMORY },
    { key: 'capacity_min_gb', label: 'Capacity, at least', type: 'number', unit: 'GB' },
    { key: 'speed_min_mts', label: 'Speed, at least', type: 'number', unit: 'MT/s' },
  ],
  gpu: [
    { key: 'vram_min_gb', label: 'Video memory, at least', type: 'number', unit: 'GB' },
    { key: 'length_max_mm', label: 'Length, at most', type: 'number', unit: 'mm' },
  ],
  storage: [
    {
      key: 'interface',
      label: 'Interface',
      type: 'select',
      options: [
        { value: 'nvme', label: 'NVMe' },
        { value: 'sata', label: 'SATA' },
      ],
    },
    { key: 'capacity_min_gb', label: 'Capacity, at least', type: 'number', unit: 'GB' },
  ],
  psu: [
    { key: 'wattage_min_w', label: 'Wattage, at least', type: 'number', unit: 'W' },
    {
      key: 'form_factor',
      label: 'Form factor',
      type: 'select',
      options: [
        { value: 'atx', label: 'ATX' },
        { value: 'sfx', label: 'SFX' },
        { value: 'sfx_l', label: 'SFX-L' },
      ],
    },
  ],
  case: [
    {
      key: 'form_factor',
      label: 'Fits motherboard',
      type: 'select',
      options: ['ATX', 'Micro-ATX', 'Mini-ITX'].map((f) => ({ value: f, label: f })),
    },
    { key: 'fits_gpu_length_mm', label: 'Fits a graphics card of', type: 'number', unit: 'mm' },
  ],
  cooler: [
    { key: 'socket', label: 'Socket', type: 'select', options: SOCKETS },
    {
      key: 'cooler_type',
      label: 'Type',
      type: 'select',
      options: [
        { value: 'air', label: 'Air' },
        { value: 'aio', label: 'Liquid (AIO)' },
      ],
    },
  ],
}

export const SORTS = [
  { value: 'name', label: 'Name' },
  { value: 'price', label: 'Price, low to high' },
  { value: '-price', label: 'Price, high to low' },
  { value: 'newest', label: 'Newest' },
] as const

const FILTER_KEYS = new Set(Object.values(SPEC_FILTERS).flatMap((defs) => defs.map((d) => d.key)))

/** Read the catalog query from the URL, keeping only known parameters (the API rejects others). */
export function queryFromSearch(params: URLSearchParams): Partial<ProductQuery> {
  const query: Record<string, string | boolean | number | string[]> = {}
  for (const [key, value] of params) {
    if (!value) continue
    if (key === 'q' || key === 'kind' || key === 'sort') query[key] = value
    else if (key === 'in_stock') query[key] = value === 'true'
    else if (key === 'brand') query[key] = value.split(',')
    else if (FILTER_KEYS.has(key as FilterKey)) {
      const def = Object.values(SPEC_FILTERS)
        .flat()
        .find((d) => d.key === key)
      query[key] = def?.type === 'number' ? Number(value) : def?.type === 'boolean' ? value === 'true' : value
    }
  }
  // Spec filters only apply within a kind; drop them otherwise rather than send a 422.
  if (!query.kind) for (const key of FILTER_KEYS) Reflect.deleteProperty(query, key)
  return query
}
