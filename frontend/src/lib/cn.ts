import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * tailwind-merge taught Forge's tokens, so a class passed by a caller (`className="px-2"`)
 * replaces the component's default instead of fighting it in CSS order. Without this, custom
 * names would be misread: `text-md` as a colour (dropping `text-ink`), `font-tech` as a weight.
 */
const merge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['md'],
    },
    classGroups: {
      'font-family': ['font-tech'],
    },
  },
})

export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs))
}
