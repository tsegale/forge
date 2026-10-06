/** Shortcuts into the catalog, each a real spec filter the API accepts. */
export const CATEGORY_LINKS: { kind: string; blurb: string; links: { label: string; href: string }[] }[] = [
  {
    kind: 'cpu',
    blurb: 'AMD Ryzen and Intel Core',
    links: [
      { label: 'AMD AM5', href: '/?kind=cpu&socket=AM5' },
      { label: 'Intel LGA1700', href: '/?kind=cpu&socket=LGA1700' },
      { label: 'With integrated graphics', href: '/?kind=cpu&has_integrated_graphics=true' },
    ],
  },
  {
    kind: 'motherboard',
    blurb: 'ATX, Micro-ATX and Mini-ITX',
    links: [
      { label: 'AM5 boards', href: '/?kind=motherboard&socket=AM5' },
      { label: 'DDR5 boards', href: '/?kind=motherboard&memory_type=ddr5' },
      { label: 'Mini-ITX', href: '/?kind=motherboard&form_factor=Mini-ITX' },
    ],
  },
  {
    kind: 'memory',
    blurb: 'DDR5 and DDR4 kits',
    links: [
      { label: 'DDR5', href: '/?kind=memory&memory_type=ddr5' },
      { label: 'DDR4', href: '/?kind=memory&memory_type=ddr4' },
      { label: '32 GB and up', href: '/?kind=memory&capacity_min_gb=32' },
    ],
  },
  {
    kind: 'gpu',
    blurb: 'NVIDIA GeForce and AMD Radeon',
    links: [
      { label: '12 GB and up', href: '/?kind=gpu&vram_min_gb=12' },
      { label: '16 GB and up', href: '/?kind=gpu&vram_min_gb=16' },
      { label: 'Compact (under 250 mm)', href: '/?kind=gpu&length_max_mm=250' },
    ],
  },
  {
    kind: 'storage',
    blurb: 'NVMe, SATA SSD and hard drives',
    links: [
      { label: 'NVMe SSDs', href: '/?kind=storage&interface=nvme' },
      { label: '2 TB and up', href: '/?kind=storage&capacity_min_gb=2000' },
    ],
  },
  {
    kind: 'psu',
    blurb: 'ATX and SFX supplies',
    links: [
      { label: '850 W and up', href: '/?kind=psu&wattage_min_w=850' },
      { label: 'SFX', href: '/?kind=psu&form_factor=sfx' },
    ],
  },
  {
    kind: 'case',
    blurb: 'Mid towers to small form factor',
    links: [
      { label: 'Fits ATX', href: '/?kind=case&form_factor=ATX' },
      { label: 'Mini-ITX', href: '/?kind=case&form_factor=Mini-ITX' },
    ],
  },
  {
    kind: 'cooler',
    blurb: 'Air towers and liquid coolers',
    links: [
      { label: 'Air coolers', href: '/?kind=cooler&cooler_type=air' },
      { label: 'Liquid (AIO)', href: '/?kind=cooler&cooler_type=aio' },
    ],
  },
  { kind: 'accessory', blurb: 'Fans and thermal paste', links: [] },
]
