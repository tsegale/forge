"""Power budget for a build.

Sustained load counts what the supply must deliver continuously: the CPU at its sustained package
limit (cpu_specs.max_power_w: AMD PPT / Intel Maximum Turbo Power), each graphics card at its rated
board power, and allowances for everything else.

Peak load adds graphics card power excursions: modern cards briefly draw well above rated board
power. The ATX 3.0/3.1 specification (Intel ATX Version 3.0 Multi Rail Desktop Platform Power
Supply Design Guide, section 3.2) requires a supply to tolerate excursions of 200% of its rated
output for 100 microseconds. ATX 2.x supplies make no such guarantee.

Each part's wattage is defined once below, in Python and in SQL from the same constants, so the
engine and the catalog's compatible-parts filter cannot disagree.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

from sqlalchemy import ColumnElement, case, literal

from ..models import CpuProduct, GpuProduct, MemoryProduct, Product, StorageProduct
from ..models.enums import KindCode, PsuAtxVersion, StorageFormFactor, StorageInterface
from .context import BuildContext

# Engineering allowances (not from a specification): chipset, VRM losses, fans, USB devices.
BASE_SYSTEM_W = 50
MEMORY_MODULE_W = 5
NVME_DRIVE_W = 8
SATA_SSD_W = 4
HDD_W = 10

# Peak graphics card draw as a multiple of rated board power during excursions.
GPU_EXCURSION_FACTOR = 2.0
# How far above its rating a supply can ride through an excursion. ATX 3.x: 200% by specification.
# ATX 2.x: no guarantee; 130% reflects typical over-power protection margins and is an assumption.
EXCURSION_TOLERANCE = {PsuAtxVersion.V3_0: 2.0, PsuAtxVersion.V3_1: 2.0, PsuAtxVersion.V2: 1.3}
# Recommended continuous loading: efficiency peaks around 50% and fan noise rises sharply past 80%.
TARGET_LOAD = 0.8
RECOMMENDATION_STEP_W = 50


def part_watts(product: Product) -> int:
    """Sustained draw of one unit of a part."""
    match KindCode(product.kind_code):
        case KindCode.CPU:
            return product.max_power_w
        case KindCode.GPU:
            return product.tdp_w
        case KindCode.MEMORY:
            return product.modules * MEMORY_MODULE_W
        case KindCode.STORAGE:
            if product.form_factor is StorageFormFactor.INCH_3_5:
                return HDD_W
            return NVME_DRIVE_W if product.interface is StorageInterface.NVME else SATA_SSD_W
        case _:
            return 0


def part_watts_sql(kind: KindCode) -> ColumnElement[Any]:
    """The same as part_watts, as a SQL expression over a candidate product of ``kind``."""
    match kind:
        case KindCode.CPU:
            return CpuProduct.max_power_w
        case KindCode.GPU:
            return GpuProduct.tdp_w
        case KindCode.MEMORY:
            return MemoryProduct.modules * MEMORY_MODULE_W
        case KindCode.STORAGE:
            return case(
                (StorageProduct.form_factor == StorageFormFactor.INCH_3_5, HDD_W),
                (StorageProduct.interface == StorageInterface.NVME, NVME_DRIVE_W),
                else_=SATA_SSD_W,
            )
        case _:
            return literal(0)


@dataclass(frozen=True, slots=True)
class PowerEstimate:
    sustained_w: int
    peak_w: int
    recommended_psu_w: int


def sustained_w(ctx: BuildContext) -> int:
    return BASE_SYSTEM_W + sum(part_watts(p.product) * p.quantity for p in ctx.parts)


def _gpu_w(ctx: BuildContext) -> int:
    return sum(p.product.tdp_w * p.quantity for p in ctx.gpus)


def estimate(ctx: BuildContext) -> PowerEstimate:
    sustained = sustained_w(ctx)
    peak = sustained + math.ceil(_gpu_w(ctx) * (GPU_EXCURSION_FACTOR - 1))
    vendor = max((g.recommended_psu_w for g in ctx.gpu_products()), default=0)
    # Sized for an ATX 3.x supply; an ATX 2.x supply needs more margin for the same peak.
    needed = max(sustained / TARGET_LOAD, peak / EXCURSION_TOLERANCE[PsuAtxVersion.V3_1], vendor)
    recommended = math.ceil(needed / RECOMMENDATION_STEP_W) * RECOMMENDATION_STEP_W
    return PowerEstimate(sustained_w=sustained, peak_w=peak, recommended_psu_w=recommended)
