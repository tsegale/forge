import { describe, expect, it } from 'vitest'
import { detailRows, findingLabel } from './findings'

describe('detailRows', () => {
  it('labels measured values and adds their units', () => {
    expect(detailRows({ gpu_length_mm: 336, case_max_gpu_length_mm: 320 })).toEqual([
      { label: 'Card length', value: '336 mm' },
      { label: 'Case fits up to', value: '320 mm' },
    ])
    expect(detailRows({ peak_w: 640, psu_w: 550 })).toEqual([
      { label: 'Peak draw', value: '640 W' },
      { label: 'Power supply', value: '550 W' },
    ])
  })

  it('formats codes and lists, keeps names, and drops what it cannot show', () => {
    expect(
      detailRows({
        memory_type: 'ddr4',
        psu_form_factor: 'sfx_l',
        case_form_factors: ['ATX', 'Micro-ATX', 'Mini-ITX'],
        nested: { a: 1 },
      }),
    ).toEqual([
      { label: 'Memory', value: 'DDR4' },
      { label: 'Supply size', value: 'SFX-L' },
      { label: 'Case takes', value: 'ATX, Micro-ATX, Mini-ITX' },
    ])
  })

  it('gives unknown keys a readable label', () => {
    expect(detailRows({ pcie_slots: 2, fan_size_mm: 140 })).toEqual([
      { label: 'Pcie slots', value: '2' },
      { label: 'Fan size', value: '140 mm' },
    ])
  })
})

describe('findingLabel', () => {
  it('falls back to the code in words', () => {
    expect(findingLabel('SOCKET_MISMATCH')).toBe('Wrong CPU socket')
    expect(findingLabel('NEW_RULE_CODE')).toBe('New rule code')
  })
})
