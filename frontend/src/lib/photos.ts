/**
 * Lifestyle photography (Unsplash, credited in docs/IMAGE_CREDITS.md), served as responsive WebP.
 * Each photo is pre-cropped to one aspect ratio at several widths: `<name>-<width>.webp`.
 */
const files = import.meta.glob<string>('/src/assets/photos/*.webp', { eager: true, import: 'default' })

export interface PhotoSource {
  /** Largest variant: the fallback src and the intrinsic size for width/height. */
  src: string
  srcSet: string
  width: number
  height: number
  alt: string
  /** CSS aspect ratio, for example "4 / 3". */
  aspect: string
}

function photo(name: string, ratio: [number, number], alt: string): PhotoSource {
  const variants = Object.entries(files)
    .map(([path, url]) => {
      const match = new RegExp(`/${name}-(\\d+)\\.webp$`).exec(path)
      return match ? { width: Number(match[1]), url } : null
    })
    .filter((variant) => variant !== null)
    .sort((a, b) => a.width - b.width)
  const largest = variants.at(-1)
  if (!largest) throw new Error(`No photo files for ${name}`)
  return {
    src: largest.url,
    srcSet: variants.map((variant) => `${variant.url} ${String(variant.width)}w`).join(', '),
    width: largest.width,
    height: Math.round((largest.width * ratio[1]) / ratio[0]),
    alt,
    aspect: `${String(ratio[0])} / ${String(ratio[1])}`,
  }
}

export const PHOTOS = {
  hero: photo(
    'hero-build',
    [4, 3],
    'Inside a white PC build: motherboard, memory and a white tower cooler with braided cables',
  ),
  auth: photo(
    'auth-build',
    [4, 3],
    'White braided power cables plugged into a graphics card beside a cooler fan',
  ),
  howAssembly: photo('how-assembly', [16, 9], 'A person fitting a component inside an open PC case'),
  emptyCart: photo('empty-cart', [3, 2], 'Three white 120 mm case fans laid out on a grey table'),
  emptyOrders: photo(
    'empty-orders',
    [3, 2],
    'A white graphics card and its backplate unboxed on a wooden desk',
  ),
} as const

/** Shop by category: one photo per component kind (accessories have none). */
export const CATEGORY_PHOTOS: Partial<Record<string, PhotoSource>> = {
  cpu: photo('category-cpu', [4, 3], 'A desktop processor, contacts up, on a light grey surface'),
  motherboard: photo(
    'category-motherboard',
    [4, 3],
    'An ATX motherboard photographed from above on a white surface',
  ),
  memory: photo('category-memory', [4, 3], 'Two black DDR5 memory modules on a grey surface'),
  gpu: photo('category-gpu', [4, 3], 'A triple-fan graphics card standing on a white shelf'),
  storage: photo('category-storage', [4, 3], 'Two boxed M.2 NVMe solid state drives'),
  psu: photo('category-psu', [4, 3], 'A compact power supply on a pale wooden table'),
  case: photo('category-case', [4, 3], 'A grey mid-tower case with a tempered glass side panel'),
  cooler: photo('category-cooler', [4, 3], 'A large twin-tower air cooler with brown fans'),
}

/** Featured builds, matched by name: a photo of a comparable build, not the exact parts. */
const BUILD_PHOTOS = {
  gaming: photo(
    'build-gaming',
    [3, 2],
    'Inside a mid-tower gaming PC with a white graphics card and a liquid cooler',
  ),
  compact: photo(
    'build-compact',
    [3, 2],
    'A compact small form factor PC with wooden slats on its side, on a desk',
  ),
  creator: photo(
    'build-creator',
    [3, 2],
    'A large white dual-chamber case with a white graphics card inside',
  ),
}

export function buildPhoto(name: string, index: number): PhotoSource {
  const lower = name.toLowerCase()
  if (/compact|small form|sff|itx/.test(lower)) return BUILD_PHOTOS.compact
  if (/creator|workstation|studio/.test(lower)) return BUILD_PHOTOS.creator
  if (/gaming|1440p|1080p|4k/.test(lower)) return BUILD_PHOTOS.gaming
  const all = [BUILD_PHOTOS.gaming, BUILD_PHOTOS.compact, BUILD_PHOTOS.creator]
  return all[index % all.length] ?? BUILD_PHOTOS.gaming
}
