import type { components } from '@/api/schema'

type Specs = components['schemas']['ProductDetail']['specs']

const LABELS: Record<string, string> = {
  socket_code: 'Socket',
  cores: 'Cores',
  threads: 'Threads',
  base_clock_mhz: 'Base clock',
  boost_clock_mhz: 'Boost clock',
  tdp_w: 'Rated power',
  max_power_w: 'Maximum sustained power',
  has_integrated_graphics: 'Integrated graphics',
  includes_cooler: 'Cooler in the box',
  form_factor_code: 'Form factor',
  chipset: 'Chipset',
  memory_type: 'Memory type',
  memory_slots: 'Memory slots',
  max_memory_gb: 'Maximum memory',
  m2_slots: 'M.2 slots',
  sata_ports: 'SATA ports',
  modules: 'Modules',
  module_capacity_gb: 'Capacity per module',
  total_capacity_gb: 'Total capacity',
  speed_mts: 'Speed',
  cas_latency: 'CAS latency',
  height_mm: 'Height',
  vram_gb: 'Video memory',
  length_mm: 'Length',
  slot_width: 'Slot width',
  power_connectors: 'Power connectors',
  recommended_psu_w: 'Recommended power supply',
  interface: 'Interface',
  form_factor: 'Form factor',
  capacity_gb: 'Capacity',
  pcie_gen: 'PCIe generation',
  wattage_w: 'Wattage',
  efficiency: 'Efficiency',
  modularity: 'Modularity',
  has_12v_2x6: '12V-2x6 cable',
  atx_version: 'ATX version',
  max_gpu_length_mm: 'Maximum graphics card length',
  max_cooler_height_mm: 'Maximum cooler height',
  max_radiator_mm: 'Maximum radiator',
  psu_form_factor: 'Power supply form factor',
  supported_form_factors: 'Supported motherboards',
  cooler_type: 'Type',
  radiator_mm: 'Radiator',
  tdp_rating_w: 'Cooling capacity',
  supported_sockets: 'Supported sockets',
}

const ENUM_LABELS: Record<string, string> = {
  ddr4: 'DDR4',
  ddr5: 'DDR5',
  nvme: 'NVMe',
  sata: 'SATA',
  m2_2280: 'M.2 2280',
  '2.5in': '2.5 inch',
  '3.5in': '3.5 inch',
  atx: 'ATX',
  sfx: 'SFX',
  sfx_l: 'SFX-L',
  air: 'Air',
  aio: 'Liquid (AIO)',
  non_modular: 'Non-modular',
  semi_modular: 'Semi-modular',
  fully_modular: 'Fully modular',
  '80plus': '80 Plus',
  '80plus_bronze': '80 Plus Bronze',
  '80plus_silver': '80 Plus Silver',
  '80plus_gold': '80 Plus Gold',
  '80plus_platinum': '80 Plus Platinum',
  '80plus_titanium': '80 Plus Titanium',
}

function unit(key: string): string {
  if (key.endsWith('_mhz')) return ' MHz'
  if (key.endsWith('_mm')) return ' mm'
  if (key.endsWith('_gb')) return ' GB'
  if (key.endsWith('_w')) return ' W'
  if (key === 'speed_mts') return ' MT/s'
  if (key === 'slot_width') return ' slots'
  return ''
}

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return 'Not specified'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'string') return key === 'atx_version' ? `ATX ${value}` : (ENUM_LABELS[value] ?? value)
  if (typeof value === 'number') return `${value.toLocaleString('en')}${unit(key)}`
  return JSON.stringify(value)
}

/** Label/value rows for a product's specs, in the order the API returns them. */
export function specRows(specs: Specs): { label: string; value: string }[] {
  if (specs.kind === 'accessory') {
    return Object.entries(specs.attributes).map(([key, value]) => ({
      label: key.replace(/_/g, ' '),
      value: formatValue(key, value),
    }))
  }
  return Object.entries(specs)
    .filter(([key]) => key !== 'kind')
    .map(([key, value]) => ({ label: LABELS[key] ?? key, value: formatValue(key, value) }))
}

type SpecRecord = Record<string, unknown>

function fieldsOf(specs: Specs): SpecRecord {
  return specs.kind === 'accessory' ? specs.attributes : specs
}

/** The three or four facts that decide a part, for cards and pickers: "AM5 / 8 cores / 5.0 GHz". */
const KEY_FIELDS: Record<string, string[]> = {
  cpu: ['socket_code', 'cores', 'boost_clock_mhz', 'tdp_w'],
  motherboard: ['socket_code', 'form_factor_code', 'chipset', 'memory_type'],
  memory: ['memory_type', 'total_capacity_gb', 'speed_mts', 'cas_latency'],
  gpu: ['vram_gb', 'length_mm', 'tdp_w', 'recommended_psu_w'],
  storage: ['capacity_gb', 'interface', 'form_factor', 'pcie_gen'],
  psu: ['wattage_w', 'efficiency', 'modularity', 'form_factor'],
  case: ['supported_form_factors', 'max_gpu_length_mm', 'max_cooler_height_mm'],
  cooler: ['cooler_type', 'height_mm', 'radiator_mm', 'supported_sockets'],
}

function keyValue(key: string, value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (Array.isArray(value)) return value.map(String).join(', ')
  if (typeof value !== 'number' && typeof value !== 'string') return formatValue(key, value)
  const v = String(value)
  switch (key) {
    case 'cores':
      return `${v} cores`
    case 'boost_clock_mhz':
      return typeof value === 'number' ? `${(value / 1000).toFixed(1)} GHz boost` : v
    case 'cas_latency':
      return `CL${v}`
    case 'pcie_gen':
      return `PCIe ${v}.0`
    case 'capacity_gb':
      return typeof value === 'number' && value >= 1000 ? `${String(value / 1000)} TB` : `${v} GB`
    case 'total_capacity_gb':
      return `${v} GB`
    case 'length_mm':
      return `${v} mm long`
    case 'max_gpu_length_mm':
      return `GPU up to ${v} mm`
    case 'max_cooler_height_mm':
      return `cooler up to ${v} mm`
    case 'height_mm':
      return `${v} mm tall`
    case 'radiator_mm':
      return `${v} mm radiator`
    case 'recommended_psu_w':
      return `${v} W PSU`
    case 'tdp_w':
      return `${v} W`
    default:
      return formatValue(key, value)
  }
}

export function keySpecs(specs: Specs): string[] {
  const fields = fieldsOf(specs)
  const keys = KEY_FIELDS[specs.kind] ?? Object.keys(fields).slice(0, 3)
  return keys.map((key) => keyValue(key, fields[key])).filter((v): v is string => Boolean(v))
}

/** Grouped specification rows for the product page. Fields not listed fall into "Other". */
const GROUPS: Record<string, [string, string[]][]> = {
  cpu: [
    ['Platform', ['socket_code', 'has_integrated_graphics', 'includes_cooler']],
    ['Performance', ['cores', 'threads', 'base_clock_mhz', 'boost_clock_mhz']],
    ['Power', ['tdp_w', 'max_power_w']],
  ],
  motherboard: [
    ['Platform', ['socket_code', 'chipset', 'form_factor_code']],
    ['Memory', ['memory_type', 'memory_slots', 'max_memory_gb']],
    ['Storage', ['m2_slots', 'sata_ports']],
  ],
  memory: [
    ['Kit', ['memory_type', 'modules', 'module_capacity_gb', 'total_capacity_gb']],
    ['Performance', ['speed_mts', 'cas_latency']],
    ['Fit', ['height_mm']],
  ],
  gpu: [
    ['Graphics', ['chipset', 'vram_gb']],
    ['Fit', ['length_mm', 'slot_width']],
    ['Power', ['tdp_w', 'power_connectors', 'recommended_psu_w']],
  ],
  storage: [['Drive', ['capacity_gb', 'interface', 'form_factor', 'pcie_gen']]],
  psu: [
    ['Output', ['wattage_w', 'efficiency', 'atx_version', 'has_12v_2x6']],
    ['Build', ['modularity', 'form_factor']],
  ],
  case: [
    ['Motherboards', ['supported_form_factors']],
    ['Clearances', ['max_gpu_length_mm', 'max_cooler_height_mm', 'max_radiator_mm']],
    ['Power supply', ['psu_form_factor']],
  ],
  cooler: [
    ['Cooler', ['cooler_type', 'tdp_rating_w']],
    ['Fit', ['height_mm', 'radiator_mm', 'supported_sockets']],
  ],
}

export function specGroups(specs: Specs): { title: string; rows: { label: string; value: string }[] }[] {
  const rows = specRows(specs)
  const fields = fieldsOf(specs)
  const groups = GROUPS[specs.kind]
  if (!groups) return [{ title: 'Specifications', rows }]
  const used = new Set<string>()
  const result = groups
    .map(([title, keys]) => ({
      title,
      rows: keys
        .filter((key) => key in fields)
        .map((key) => {
          used.add(key)
          return { label: LABELS[key] ?? key, value: formatValue(key, fields[key]) }
        }),
    }))
    .filter((group) => group.rows.length > 0)
  const rest = Object.keys(fields).filter((key) => key !== 'kind' && !used.has(key))
  if (rest.length) {
    result.push({
      title: 'Other',
      rows: rest.map((key) => ({ label: LABELS[key] ?? key, value: formatValue(key, fields[key]) })),
    })
  }
  return result
}
