/** Short labels for compatibility finding codes; full messages come from the API. */
const LABELS: Record<string, string> = {
  COOLER_SOCKET_UNSUPPORTED: 'Cooler does not fit the socket',
  COOLER_TOO_TALL: 'Cooler too tall for the case',
  COOLER_UNDERRATED: 'Cooler rated below the CPU',
  FORM_FACTOR_UNSUPPORTED: 'Board does not fit the case',
  GPU_TOO_LONG: 'Graphics card too long',
  M2_SLOTS_EXCEEDED: 'Not enough M.2 slots',
  MEMORY_CAPACITY_EXCEEDED: 'Over the board memory limit',
  MEMORY_SLOTS_EXCEEDED: 'Not enough memory slots',
  MEMORY_TYPE_MISMATCH: 'Wrong memory type',
  MIXED_MEMORY_KITS: 'Mixed memory kits',
  PSU_BELOW_GPU_RECOMMENDATION: 'Below the GPU maker recommendation',
  PSU_FORM_FACTOR_MISMATCH: 'Power supply does not fit the case',
  PSU_HIGH_LOAD: 'Power supply under high load',
  PSU_INSUFFICIENT: 'Power supply too small',
  PSU_NEEDS_ADAPTER: 'Needs a power adapter cable',
  PSU_NEEDS_BRACKET: 'Needs an SFX bracket',
  PSU_SFX_L_CLEARANCE: 'SFX-L clearance',
  PSU_TRANSIENT_RISK: 'Power spike risk',
  RADIATOR_UNSUPPORTED: 'Radiator does not fit the case',
  SATA_PORTS_EXCEEDED: 'Not enough SATA ports',
  SOCKET_MISMATCH: 'Wrong CPU socket',
}

export function findingLabel(code: string): string {
  const label = LABELS[code]
  if (label) return label
  const words = code.toLowerCase().replaceAll('_', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** What each measured value in a finding's `details` is, as shown beside the message. */
const DETAIL_LABELS: Record<string, string> = {
  gpu_length_mm: 'Card length',
  case_max_gpu_length_mm: 'Case fits up to',
  cooler_height_mm: 'Cooler height',
  case_max_cooler_height_mm: 'Case fits up to',
  radiator_mm: 'Radiator',
  case_max_radiator_mm: 'Case fits up to',
  psu_w: 'Power supply',
  peak_w: 'Peak draw',
  sustained_w: 'Sustained draw',
  recommended_psu_w: 'Recommended supply',
  gpu_recommended_psu_w: 'Card maker recommends',
  cpu_max_power_w: 'Processor draws up to',
  cooler_tdp_rating_w: 'Cooler rated for',
  cpu_socket: 'Processor socket',
  motherboard_socket: 'Board socket',
  cooler_sockets: 'Cooler fits',
  memory_type: 'Memory',
  motherboard_memory_type: 'Board takes',
  motherboard_form_factor: 'Board size',
  case_form_factors: 'Case takes',
  psu_form_factor: 'Supply size',
  case_psu_form_factor: 'Case takes',
  memory_slots: 'Memory slots',
  modules: 'Modules chosen',
  max_memory_gb: 'Board maximum',
  capacity_gb: 'Memory chosen',
  sata_ports: 'SATA ports',
  sata_drives: 'SATA drives',
  gpu_connectors: 'Card power connectors',
  atx_version: 'ATX version',
  excursion_tolerance: 'Spike tolerance',
  kits: 'Kits',
}

const UNITS: [suffix: string, unit: string][] = [
  ['_mm', 'mm'],
  ['_w', 'W'],
  ['_gb', 'GB'],
]

function formatValue(key: string, value: unknown): string | null {
  if (Array.isArray(value)) {
    const parts = value.filter((v): v is string | number => typeof v === 'string' || typeof v === 'number')
    return parts.length ? parts.map(String).join(', ') : null
  }
  if (typeof value === 'number') {
    const unit = UNITS.find(([suffix]) => key.endsWith(suffix))?.[1]
    if (key === 'excursion_tolerance') return `${String(value)}x`
    return unit ? `${String(value)} ${unit}` : String(value)
  }
  // Enum codes arrive lowercase ("ddr5", "sfx_l"); names such as "Mini-ITX" are shown as they are.
  if (typeof value === 'string')
    return /^[a-z0-9_]+$/.test(value) ? value.replaceAll('_', '-').toUpperCase() : value
  return null
}

/**
 * The measured values behind a finding ("Card length 336 mm", "Case fits up to 320 mm"), from the
 * engine's `details`. Unknown keys are shown with a readable label rather than dropped.
 */
export function detailRows(details: Record<string, unknown>): { label: string; value: string }[] {
  return Object.entries(details).flatMap(([key, value]) => {
    const formatted = formatValue(key, value)
    if (formatted === null) return []
    const label = DETAIL_LABELS[key] ?? findingLabel(key.replace(/_(mm|w|gb)$/, ''))
    return [{ label, value: formatted }]
  })
}
