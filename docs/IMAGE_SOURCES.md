# Product image sources

Official manufacturer product pages for every seeded part (62 SKUs), for downloading product
photos. The photos are the manufacturers' marketing images, used here for an academic demo
store. They are not committed to this repository (see the README, "Product images").

## How to save them

- Folder: `backend/seed/images/` (gitignored).
- File name: `<SKU>-<n>.<ext>`, for example `FRG-CPU-R7-7800X3D-1.png`.
  - `n` starts at 1. Image 1 is the main photo used on cards and in the configurator: the
    product alone, ideally on a white or transparent background, front or three-quarter view.
  - Images 2 and up appear in the product gallery in that order (side, back, ports, in box).
- Formats: `.jpg`, `.jpeg`, `.png` or `.webp`, at least 1200 px on the long side if available.
  Up to 6 images per product.
- Import with `flask seed images` (from `backend/`, or `docker compose run --rm api flask seed
  images` for the stack, which mounts this folder read-only). It corrects rotation, flattens
  transparency onto white, trims the empty margin, and writes WebP at 320, 640 and 1280 px wide
  (never enlarged) under `backend/media/products/`. Re-running is safe; a replaced photo gets a
  new URL, and files whose SKU is unknown are listed and skipped.

## Priority

**P1** parts appear in the featured builds on the home page and in the demo; download these
first. **P2** is everything else. Until a product has a photo, the store shows a clean drawing
of its kind, so missing photos never break a page.

Featured builds (planned; each is checked to be compatible and complete when it is seeded):

| Build | Parts |
| --- | --- |
| 1440p gaming (the seeded "Demo gaming rig") | 7800X3D, MAG B650 TOMAHAWK WIFI, Vengeance 32GB DDR5-6000, 990 PRO 2TB, RTX 4070 SUPER VENTUS 2X, RM850e, North, Peerless Assassin 120 SE |
| Compact small form factor | 9800X3D, ROG STRIX B650E-I, Trident Z5 RGB 32GB, SN850X 1TB, PULSE RX 7800 XT, SF750, NR200P, Kraken 240 |
| Creator workstation | 7950X, ROG STRIX X670E-E, Vengeance 64GB DDR5-6000, 990 PRO 2TB, BarraCuda 2TB, TUF RTX 4080 SUPER, RM1000x, O11 Dynamic EVO, Liquid Freezer III 360 |

## Notes on matching the right product

Several products exist in more than one revision. The links below are for the revision whose
specifications are in the seed catalog; where it matters, the note says how to tell.

- Every link was checked on 7 October 2026. 41 opened directly; the rest are on sites that refuse
  automated requests or rate-limit them (Intel, MSI, Gigabyte, Kingston, NVIDIA's store, Noctua,
  be quiet!) and were confirmed through search instead. All point to the manufacturer's own
  domain. Two products have no live product page any more, noted in their rows.
- Regional versions of a page (us, uk, global) show the same photos; any of them is fine.

## CPUs

| Priority | SKU | Product | Official page | Notes |
| --- | --- | --- | --- | --- |
| P2 | FRG-CPU-R5-7600X | AMD Ryzen 5 7600X | https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-5-7600x.html | |
| P1 | FRG-CPU-R7-7800X3D | AMD Ryzen 7 7800X3D | https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-7-7800x3d.html | Demo path starts here |
| P1 | FRG-CPU-R7-9800X3D | AMD Ryzen 7 9800X3D | https://www.amd.com/en/products/processors/desktops/ryzen/9000-series/amd-ryzen-7-9800x3d.html | |
| P1 | FRG-CPU-R9-7950X | AMD Ryzen 9 7950X | https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-9-7950x.html | |
| P2 | FRG-CPU-R5-5600X | AMD Ryzen 5 5600X | https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-5-5600x.html | |
| P2 | FRG-CPU-R7-5800X3D | AMD Ryzen 7 5800X3D | https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-7-5800x3d.html | |
| P2 | FRG-CPU-I5-12400F | Intel Core i5-12400F | https://www.intel.com/content/www/us/en/products/sku/134587/intel-core-i512400f-processor-18m-cache-up-to-4-40-ghz/specifications.html | Intel's spec pages have few photos; Intel's newsroom has press images |
| P2 | FRG-CPU-I5-13600K | Intel Core i5-13600K | https://www.intel.com/content/www/us/en/products/sku/230493/intel-core-i513600k-processor-24m-cache-up-to-5-10-ghz/specifications.html | As above |
| P2 | FRG-CPU-I7-14700K | Intel Core i7-14700K | https://www.intel.com/content/www/us/en/products/sku/236783/intel-core-i7-processor-14700k-33m-cache-up-to-5-60-ghz/specifications.html | As above |
| P2 | FRG-CPU-I9-14900K | Intel Core i9-14900K | https://www.intel.com/content/www/us/en/products/sku/236773/intel-core-i9-processor-14900k-36m-cache-up-to-6-00-ghz/specifications.html | As above |
| P2 | FRG-CPU-U7-265K | Intel Core Ultra 7 265K | https://www.intel.com/content/www/us/en/products/sku/241063/intel-core-ultra-7-processor-265k-30m-cache-up-to-5-50-ghz/specifications.html | As above |

## Motherboards

| Priority | SKU | Product | Official page | Notes |
| --- | --- | --- | --- | --- |
| P1 | FRG-MB-MSI-B650-TOMAHAWK | MSI MAG B650 TOMAHAWK WIFI | https://www.msi.com/Motherboard/MAG-B650-TOMAHAWK-WIFI | |
| P2 | FRG-MB-GB-B650M-ELITE | Gigabyte B650M AORUS ELITE AX | https://www.gigabyte.com/Motherboard/B650M-AORUS-ELITE-AX-rev-10-11 | Rev. 1.0/1.1; later revisions look almost identical |
| P1 | FRG-MB-ASUS-B650E-I | ASUS ROG STRIX B650E-I GAMING WIFI | https://rog.asus.com/motherboards/rog-strix/rog-strix-b650e-i-gaming-wifi-model/ | |
| P1 | FRG-MB-ASUS-X670E-E | ASUS ROG STRIX X670E-E GAMING WIFI | https://rog.asus.com/motherboards/rog-strix/rog-strix-x670e-e-gaming-wifi-model/ | |
| P2 | FRG-MB-MSI-B550-TOMAHAWK | MSI MAG B550 TOMAHAWK | https://www.msi.com/Motherboard/MAG-B550-TOMAHAWK | Not the MAX WIFI or WIFI variants |
| P2 | FRG-MB-ASUS-B760-PLUS-D4 | ASUS TUF GAMING B760-PLUS WIFI D4 | https://www.asus.com/motherboards-components/motherboards/tuf-gaming/tuf-gaming-b760-plus-wifi-d4/ | The D4 (DDR4) model, not B760M |
| P2 | FRG-MB-MSI-Z790-A | MSI PRO Z790-A WIFI | https://www.msi.com/Motherboard/PRO-Z790-A-WIFI | Not the MAX, II or DDR4 variants |
| P2 | FRG-MB-GB-B760I-D4 | Gigabyte B760I AORUS PRO DDR4 | https://www.gigabyte.com/us/Motherboard/B760I-AORUS-PRO-DDR4-rev-1x | |
| P2 | FRG-MB-MSI-Z890-A | MSI PRO Z890-A WIFI | https://www.msi.com/Motherboard/PRO-Z890-A-WIFI | |

## Memory

| Priority | SKU | Product | Official page | Notes |
| --- | --- | --- | --- | --- |
| P1 | FRG-RAM-GS-TZ5-32-6000 | G.Skill Trident Z5 RGB 32GB (2x16GB) DDR5-6000 CL30 | https://www.gskill.com/product/165/374/1649235161/F5-6000J3040F16GX2-TZ5RK-F5-6000J3040F16GA2-TZ5RK | Part F5-6000J3040F16GX2-TZ5RK (black) |
| P1 | FRG-RAM-CR-VEN-32-6000 | Corsair Vengeance 32GB (2x16GB) DDR5-6000 CL30 | https://www.corsair.com/us/en/p/memory/cmk32gx5m2b6000z30/vengeance-32gb-2x16gb-ddr5-dram-6000mt-s-cl30-amd-expo-memory-black-cmk32gx5m2b6000z30 | Part CMK32GX5M2B6000Z30 (black, EXPO and XMP) |
| P1 | FRG-RAM-CR-VEN-64-6000 | Corsair Vengeance 64GB (2x32GB) DDR5-6000 CL30 | https://www.corsair.com/us/en/p/memory/cmk64gx5m2b6000z30/vengeance-64gb-2x32gb-ddr5-dram-6000mt-s-cl30-amd-expo-memory-kit-cmk64gx5m2b6000z30 | Part CMK64GX5M2B6000Z30 (black) |
| P2 | FRG-RAM-KS-FB-32-5600 | Kingston FURY Beast 32GB (2x16GB) DDR5-5600 CL36 | https://www.kingston.com/en/memory/search?partid=KF556C36BBEK2-32 | Part KF556C36BBEK2-32 (black, non-RGB); photos are on the FURY Beast DDR5 family page linked from there |
| P2 | FRG-RAM-CR-LPX-32-3200 | Corsair Vengeance LPX 32GB (2x16GB) DDR4-3200 CL16 | https://www.corsair.com/us/en/p/memory/cmk32gx4m2e3200c16/vengeancea-lpx-32gb-2-x-16gb-ddr4-dram-3200mhz-c16-memory-kit-black-cmk32gx4m2e3200c16 | Part CMK32GX4M2E3200C16 |
| P2 | FRG-RAM-CR-LPX-64-3200 | Corsair Vengeance LPX 64GB (2x32GB) DDR4-3200 CL16 | https://www.corsair.com/us/en/p/memory/cmk64gx4m2e3200c16/vengeancea-lpx-64gb-2-x-32gb-ddr4-dram-3200mhz-c16-memory-kit-black-cmk64gx4m2e3200c16 | Part CMK64GX4M2E3200C16 |
| P2 | FRG-RAM-GS-RV-16-3600 | G.Skill Ripjaws V 16GB (2x8GB) DDR4-3600 CL16 | https://www.gskill.com/product/165/184/1562831134/F4-3600C16D-16GVKC | Part F4-3600C16D-16GVKC |

## Graphics cards

| Priority | SKU | Product | Official page | Notes |
| --- | --- | --- | --- | --- |
| P2 | FRG-GPU-ASUS-4060-DUAL | ASUS Dual GeForce RTX 4060 OC 8GB | https://www.asus.com/us/motherboards-components/graphics-cards/dual/dual-rtx4060-o8g/ | The original 2.5-slot DUAL-RTX4060-O8G, not V2, EVO or White |
| P1 | FRG-GPU-MSI-4070S-V2X | MSI GeForce RTX 4070 SUPER VENTUS 2X OC 12GB | https://www.msi.com/Graphics-Card/GeForce-RTX-4070-SUPER-12G-VENTUS-2X-OC | Not the White variant |
| P2 | FRG-GPU-NV-5070-FE | NVIDIA GeForce RTX 5070 Founders Edition 12GB | https://marketplace.nvidia.com/en-us/consumer/graphics-cards/geforce-rtx-5070-founders-edition/ | Family page with more photos: https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5070-family/ |
| P1 | FRG-GPU-ASUS-4080S-TUF | ASUS TUF Gaming GeForce RTX 4080 SUPER OC 16GB | https://www.asus.com/us/motherboards-components/graphics-cards/tuf-gaming/tuf-rtx4080s-o16g-gaming/ | |
| P2 | FRG-GPU-NV-5080-FE | NVIDIA GeForce RTX 5080 Founders Edition 16GB | https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5080/ | The product page shows the Founders Edition |
| P2 | FRG-GPU-NV-5090-FE | NVIDIA GeForce RTX 5090 Founders Edition 32GB | https://marketplace.nvidia.com/en-us/consumer/graphics-cards/geforce-rtx-5090-founders-edition/ | Product page: https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5090/ |
| P2 | FRG-GPU-SAP-7600-PULSE | Sapphire PULSE Radeon RX 7600 8GB | https://www.sapphiretech.com/en/consumer/pulse-radeon-rx-7600-8g-gddr6 | Not the 7600 XT |
| P1 | FRG-GPU-SAP-7800XT-PULSE | Sapphire PULSE Radeon RX 7800 XT 16GB | https://www.sapphiretech.com/en/consumer/pulse-radeon-rx-7800-xt-16g-gddr6 | |

## Storage

| Priority | SKU | Product | Official page | Notes |
| --- | --- | --- | --- | --- |
| P1 | FRG-SSD-SAM-990PRO-2TB | Samsung 990 PRO 2TB NVMe SSD | https://www.samsung.com/us/memory-storage/nvme-ssd/990-pro-pcie-4-0-nvme-ssd-1tb-sku-mz-v9p2t0b-am/ | Without heatsink (MZ-V9P2T0B) |
| P1 | FRG-SSD-WD-SN850X-1TB | WD_BLACK SN850X 1TB NVMe SSD | https://www.sandisk.com/products/ssd/internal-ssd/wd-black-sn850x-nvme-ssd?sku=WDS100T2X0E | WD_BLACK SSDs moved to Sandisk; without heatsink (WDS100T2X0E) |
| P2 | FRG-SSD-CRU-P3P-1TB | Crucial P3 Plus 1TB NVMe SSD | https://www.crucial.com/ssd/p3-plus/ct1000p3pssd8 | Not the P3 (non-Plus) |
| P2 | FRG-SSD-CRU-MX500-1TB | Crucial MX500 1TB 2.5" SATA SSD | https://www.crucial.com/support/ssd-support/mx500-support | Crucial has retired the MX500 product pages (they now return 404); the support page and the product flyer (https://content.crucial.com/content/dam/crucial/ssd-products/mx500/flyer/crucial-mx500-ssd-productflyer-en.pdf) show the drive |
| P1 | FRG-HDD-SEA-BC-2TB | Seagate BarraCuda 2TB 3.5" HDD | https://www.seagate.com/products/hard-drives/barracuda-hard-drive/ | 2TB model ST2000DM008 |

## Power supplies

| Priority | SKU | Product | Official page | Notes |
| --- | --- | --- | --- | --- |
| P2 | FRG-PSU-CM-MWE550 | Cooler Master MWE 550 Bronze V2 | https://www.coolermaster.com/en-global/products/mwe-550-bronze-v2-230v.html | |
| P2 | FRG-PSU-BQ-PP12M-650 | be quiet! Pure Power 12 M 650W | https://www.bequiet.com/en/powersupply/4074 | Series page; choose the 650W model (article BN343). The site blocks automated access, so the exact model page could not be confirmed |
| P2 | FRG-PSU-SS-GX750 | Seasonic FOCUS GX-750 ATX 3 | https://seasonic.com/focus-gx-atx-3/ | ATX 3.1 FOCUS GX, not the older non-ATX 3 model |
| P1 | FRG-PSU-CR-RM850E | Corsair RM850e | https://www.corsair.com/us/en/p/psu/cp-9020263-na/rme-series-rm850e-fully-modular-low-noise-atx-power-supply-cp-9020263-na | Black (CP-9020263) |
| P1 | FRG-PSU-CR-RM1000X | Corsair RM1000x | https://www.corsair.com/us/en/p/psu/cp-9020271-na/rmx-series-rm1000x-fully-modular-power-supply-cp-9020271-na | ATX 3.1 model (CP-9020271), not SHIFT |
| P2 | FRG-PSU-CR-HX1500I | Corsair HX1500i | https://www.corsair.com/us/en/p/psu/cp-9020309-na/hx1500i-fully-modular-ultra-low-noise-platinum-atx-1500-watt-pc-power-supply-cp-9020309-na | ATX 3.1 model (CP-9020309), not SHIFT |
| P1 | FRG-PSU-CR-SF750 | Corsair SF750 | https://www.corsair.com/us/en/p/psu/cp-9020186-na/sf-series-sf750-750-watt-80-plus-platinum-certified-high-performance-sfx-psu-cp-9020186-na | The original SF750 Platinum (CP-9020186), matching the seed's ATX 2.x rating |

## Cases

| Priority | SKU | Product | Official page | Notes |
| --- | --- | --- | --- | --- |
| P1 | FRG-CASE-LL-O11EVO | Lian Li O11 Dynamic EVO | https://lian-li.com/product/o11-dynamic-evo/ | Not the EVO RGB or EVO XL |
| P1 | FRG-CASE-FD-NORTH | Fractal Design North | https://www.fractal-design.com/products/cases/north/north/charcoal-black/ | Charcoal Black; not North XL or Momentum Edition |
| P2 | FRG-CASE-NZ-H5FLOW | NZXT H5 Flow | https://cdn-g.nzxt.com/dl/1716369767-case_h5-flow_digital-manual-en.pdf | The 2022 model (365mm GPU clearance in the seed). NZXT has retired its 2022 product page (https://nzxt.com/products/h5-flow-2022 now returns 404) and the current page (https://nzxt.com/products/h5-flow) shows the different 2024 model; the 2022 manual has official photos |
| P2 | FRG-CASE-CR-4000D | Corsair 4000D Airflow | https://www.corsair.com/us/en/p/pc-cases/cc-9011200-ww/4000d-airflow-tempered-glass-mid-tower-atx-case-black-cc-9011200-ww | Black (CC-9011200-WW) |
| P1 | FRG-CASE-CM-NR200P | Cooler Master MasterBox NR200P | https://www.coolermaster.com/en-global/products/masterbox-nr200p.html | The original NR200P, not V2 or V3 |
| P2 | FRG-CASE-LL-A3 | Lian Li A3-mATX | https://lian-li.com/product/a3-matx/ | |

## CPU coolers

| Priority | SKU | Product | Official page | Notes |
| --- | --- | --- | --- | --- |
| P2 | FRG-COOL-NOC-NHD15 | Noctua NH-D15 chromax.black | https://www.noctua.at/en/products/nh-d15-chromax-black | Not the NH-D15 G2 |
| P1 | FRG-COOL-TR-PA120SE | Thermalright Peerless Assassin 120 SE | https://www.thermalright.com/product/peerless-assassin-120-se/ | Not the BLACK, ARGB, V2 or V3 variants |
| P2 | FRG-COOL-DC-AK400 | DeepCool AK400 | https://global.deepcool.com/products/Cooling/cpuaircoolers/AK400-Performance-CPU-Cooler/2021/15222.shtml | Not DIGITAL, WH or ZERO DARK |
| P2 | FRG-COOL-NOC-L9A-AM5 | Noctua NH-L9a-AM5 | https://www.noctua.at/en/products/nh-l9a-am5 | Brown and beige, not chromax.black |
| P1 | FRG-COOL-AR-LF3-360 | Arctic Liquid Freezer III 360 | https://www.arctic.de/us/Liquid-Freezer-III-360/ACFRE00136A | Not Pro or A-RGB |
| P1 | FRG-COOL-NZ-KRAKEN240 | NZXT Kraken 240 | https://nzxt.com/en-intl/products/kraken-240 | Not RGB, Plus or Elite |

## Accessories

| Priority | SKU | Product | Official page | Notes |
| --- | --- | --- | --- | --- |
| P2 | FRG-ACC-AR-MX4-4G | Arctic MX-4 Thermal Compound 4g | https://www.arctic.de/en/MX-4/ACTCP00031B | |
| P2 | FRG-ACC-AR-P12-5PK | Arctic P12 PWM PST 120mm Fan (5-pack) | https://www.arctic.de/us/P12-PWM-PST/ACFAN00137A | The 5-pack value pack |
| P2 | FRG-ACC-NOC-NFA12X25 | Noctua NF-A12x25 PWM 120mm Fan | https://www.noctua.at/en/products/nf-a12x25-pwm | Not the G2, 5V or LS variants |
