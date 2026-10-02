/** Plural display names per component kind. */
export const KIND_LABELS: Record<string, string> = {
  cpu: 'Processors',
  motherboard: 'Motherboards',
  memory: 'Memory',
  gpu: 'Graphics cards',
  storage: 'Storage',
  psu: 'Power supplies',
  case: 'Cases',
  cooler: 'CPU coolers',
  accessory: 'Accessories',
}

/** A kind label for use mid-sentence: "Memory kit" becomes "memory kit", "CPU" stays "CPU". */
export function inSentence(label: string): string {
  const [first = '', second = ''] = label
  return second === second.toUpperCase() && second !== second.toLowerCase()
    ? label
    : first.toLowerCase() + label.slice(1)
}
