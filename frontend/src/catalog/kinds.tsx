import {
  Box,
  Cable,
  CircuitBoard,
  Cpu,
  Fan,
  Gpu,
  HardDrive,
  MemoryStick,
  Zap,
  type LucideIcon,
} from 'lucide-react'

/** One inline SVG icon per component kind (the catalog has no product photos). */
const ICONS: Record<string, LucideIcon> = {
  cpu: Cpu,
  motherboard: CircuitBoard,
  memory: MemoryStick,
  gpu: Gpu,
  storage: HardDrive,
  psu: Zap,
  case: Box,
  cooler: Fan,
  accessory: Cable,
}

export function KindIcon({ kind, className = 'h-5 w-5' }: { kind: string; className?: string }) {
  const Icon = ICONS[kind] ?? Box
  return <Icon aria-hidden="true" className={className} strokeWidth={1.75} />
}
