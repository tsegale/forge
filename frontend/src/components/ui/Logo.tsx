import logo2x from '@/assets/brand/forge-logo-80.webp'
import logo3x from '@/assets/brand/forge-logo-120.webp'

/**
 * Forge logo (mark and wordmark). Decorative: every use sits inside a link labelled "Forge home".
 * Sized by its height; the files are 2x and 3x of 40 px, and width/height keep the ratio before load.
 */
export function Logo({ className = 'h-9' }: { className?: string }) {
  return (
    <img
      src={logo2x}
      srcSet={`${logo2x} 2x, ${logo3x} 3x`}
      width={207}
      height={80}
      alt=""
      decoding="async"
      className={`w-auto ${className}`}
    />
  )
}
