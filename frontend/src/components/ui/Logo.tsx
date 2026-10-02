/** Forge logomark: an anvil-like block with a spark, drawn as inline SVG (no icon fonts). */
export function Logo({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <rect x="3" y="14" width="26" height="7" rx="1.5" fill="currentColor" />
      <path d="M9 21h14l-2.5 7h-9z" fill="currentColor" opacity="0.75" />
      <path d="M16 3l1.6 4.4L22 9l-4.4 1.6L16 15l-1.6-4.4L10 9l4.4-1.6z" fill="currentColor" opacity="0.9" />
    </svg>
  )
}
