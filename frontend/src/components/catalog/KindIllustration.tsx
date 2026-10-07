import { cn } from '@/lib/cn'
import type { ReactNode } from 'react'

/**
 * Line drawings of each component kind, shown wherever a product has no photo yet. Same frame
 * (160 x 120) and stroke for every kind, so a mixed grid of photos and drawings stays orderly.
 */

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

const DRAWINGS: Record<string, ReactNode> = {
  cpu: (
    <g {...STROKE}>
      <rect x="50" y="30" width="60" height="60" rx="4" />
      <rect x="62" y="42" width="36" height="36" rx="2" />
      {[38, 50, 62, 74, 86].map((y) => (
        <g key={y}>
          <path d={`M42 ${String(y)}h8`} />
          <path d={`M110 ${String(y)}h8`} />
        </g>
      ))}
      {[58, 70, 80, 92, 102].map((x) => (
        <g key={x}>
          <path d={`M${String(x)} 22v8`} />
          <path d={`M${String(x)} 90v8`} />
        </g>
      ))}
    </g>
  ),
  motherboard: (
    <g {...STROKE}>
      <rect x="34" y="18" width="92" height="84" rx="3" />
      <rect x="44" y="28" width="26" height="26" rx="2" />
      <path d="M80 28v26M86 28v26M92 28v26M98 28v26" />
      <rect x="44" y="66" width="72" height="6" rx="1" />
      <rect x="44" y="80" width="72" height="6" rx="1" />
      <circle cx="108" cy="38" r="6" />
    </g>
  ),
  memory: (
    <g {...STROKE}>
      <rect x="22" y="42" width="116" height="30" rx="3" />
      <path d="M22 72v8h50v-4h6v4h60v-8" />
      {[32, 50, 68, 92, 110].map((x) => (
        <rect key={x} x={x} y="49" width="12" height="16" rx="1" />
      ))}
    </g>
  ),
  gpu: (
    <g {...STROKE}>
      <rect x="20" y="34" width="120" height="48" rx="4" />
      <circle cx="54" cy="58" r="16" />
      <circle cx="54" cy="58" r="4" />
      <circle cx="104" cy="58" r="16" />
      <circle cx="104" cy="58" r="4" />
      <path d="M28 82v8h40" />
      <path d="M20 40h-6v36h6" />
    </g>
  ),
  storage: (
    <g {...STROKE}>
      <rect x="24" y="46" width="112" height="28" rx="3" />
      <path d="M128 50v20" />
      <rect x="36" y="53" width="22" height="14" rx="1" />
      <rect x="64" y="53" width="22" height="14" rx="1" />
      <rect x="92" y="55" width="14" height="10" rx="1" />
      <circle cx="30" cy="60" r="2.5" />
    </g>
  ),
  psu: (
    <g {...STROKE}>
      <rect x="34" y="26" width="92" height="68" rx="4" />
      <circle cx="80" cy="60" r="24" />
      <path d="M80 36v48M56 60h48M63 43l34 34M97 43l-34 34" />
      <rect x="40" y="32" width="12" height="8" rx="1" />
    </g>
  ),
  case: (
    <g {...STROKE}>
      <rect x="50" y="12" width="60" height="96" rx="4" />
      <path d="M58 22h44M58 30h44" />
      <rect x="58" y="40" width="44" height="48" rx="2" />
      <circle cx="66" cy="98" r="2.5" />
      <path d="M78 98h22" />
    </g>
  ),
  cooler: (
    <g {...STROKE}>
      <rect x="44" y="18" width="72" height="62" rx="3" />
      {[28, 38, 48, 58, 68].map((y) => (
        <path key={y} d={`M44 ${String(y)}h72`} />
      ))}
      <path d="M64 80v14M80 80v14M96 80v14" />
      <rect x="56" y="94" width="48" height="8" rx="2" />
    </g>
  ),
  accessory: (
    <g {...STROKE}>
      <rect x="44" y="24" width="72" height="72" rx="6" />
      <circle cx="80" cy="60" r="26" />
      <circle cx="80" cy="60" r="6" />
      <path d="M80 54c-4-10-14-12-20-8M86 60c10-4 12-14 8-20M80 66c4 10 14 12 20 8M74 60c-10 4-12 14-8 20" />
    </g>
  ),
}

export function KindIllustration({
  kind,
  label,
  className,
}: {
  kind: string
  label?: string
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 160 120"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn('h-full w-full text-ink-subtle/70', className)}
    >
      {DRAWINGS[kind] ?? DRAWINGS.accessory}
    </svg>
  )
}
