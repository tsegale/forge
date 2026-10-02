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
