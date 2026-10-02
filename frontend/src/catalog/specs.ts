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
