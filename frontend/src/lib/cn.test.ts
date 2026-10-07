import { describe, expect, it } from 'vitest'
import { cn } from './cn'

describe('cn', () => {
  it('lets a later class replace a conflicting earlier one', () => {
    expect(cn('h-10 px-4', 'px-0 w-10')).toBe('h-10 px-0 w-10')
  })

  it('knows the custom tokens', () => {
    expect(cn('text-md text-ink')).toBe('text-md text-ink') // size and colour are different groups
    expect(cn('text-base', 'text-md')).toBe('text-md')
    expect(cn('font-tech font-medium')).toBe('font-tech font-medium')
    expect(cn('text-ink-muted', 'text-accent')).toBe('text-accent')
  })
})
