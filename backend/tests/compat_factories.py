"""In-memory products for rule unit tests. Defaults describe a compatible AM5 build, so each test
changes only the attribute it is about. Nothing here touches the database."""

from __future__ import annotations

from decimal import Decimal
from itertools import count
from typing import Any

from app.compat import BuildContext, Part
from app.models import (
    BoardFormFactor,
    CaseProduct,
    CoolerProduct,
    CpuProduct,
    GpuProduct,
    MemoryProduct,
    MotherboardProduct,
    PsuProduct,
    Socket,
    StorageProduct,
)
from app.models.enums import (
    CoolerType,
    MemoryType,
    PsuAtxVersion,
    PsuFormFactor,
    StorageFormFactor,
    StorageInterface,
)

REQUIRED = ("cpu", "motherboard", "memory", "storage", "psu", "case")
_ids = count(1)


def _make(cls: type, defaults: dict[str, Any], overrides: dict[str, Any]) -> Any:
    values = {"id": next(_ids), "name": cls.__name__, "price_cents": 10_000} | defaults | overrides
    return cls(**values)


def cpu(**kw: Any) -> CpuProduct:
    return _make(
        CpuProduct,
        {
            "socket_code": "AM5",
            "cores": 8,
            "threads": 16,
            "base_clock_mhz": 4200,
            "boost_clock_mhz": 5000,
            "tdp_w": 120,
            "max_power_w": 162,
            "has_integrated_graphics": True,
            "includes_cooler": False,
        },
        kw,
    )


def motherboard(**kw: Any) -> MotherboardProduct:
    return _make(
        MotherboardProduct,
        {
            "socket_code": "AM5",
            "form_factor_code": "ATX",
            "chipset": "B650",
            "memory_type": MemoryType.DDR5,
            "memory_slots": 4,
            "max_memory_gb": 192,
            "m2_slots": 3,
            "sata_ports": 6,
        },
        kw,
    )


def memory(**kw: Any) -> MemoryProduct:
    modules, capacity = kw.get("modules", 2), kw.get("module_capacity_gb", 16)
    return _make(
        MemoryProduct,
        {
            "memory_type": MemoryType.DDR5,
            "modules": modules,
            "module_capacity_gb": capacity,
            "total_capacity_gb": modules * capacity,  # a generated column in the database
            "speed_mts": 6000,
            "cas_latency": 30,
            "height_mm": Decimal("35.0"),
        },
        kw,
    )


def gpu(**kw: Any) -> GpuProduct:
    return _make(
        GpuProduct,
        {
            "chipset": "GeForce RTX 4070 SUPER",
            "vram_gb": 12,
            "length_mm": 242,
            "slot_width": Decimal("2.0"),
            "tdp_w": 220,
            "power_connectors": "1x 8-pin",
            "recommended_psu_w": 650,
        },
        kw,
    )


def storage(**kw: Any) -> StorageProduct:
    return _make(
        StorageProduct,
        {
            "interface": StorageInterface.NVME,
            "form_factor": StorageFormFactor.M2_2280,
            "capacity_gb": 1000,
            "pcie_gen": 4,
        },
        kw,
    )


def psu(**kw: Any) -> PsuProduct:
    return _make(
        PsuProduct,
        {
            "wattage_w": 850,
            "efficiency": "80plus_gold",
            "modularity": "fully_modular",
            "form_factor": PsuFormFactor.ATX,
            "has_12v_2x6": True,
            "atx_version": PsuAtxVersion.V3_1,
        },
        kw,
    )


def case(form_factors: tuple[str, ...] = ("ATX", "Micro-ATX", "Mini-ITX"), **kw: Any) -> CaseProduct:
    return _make(
        CaseProduct,
        {
            "max_gpu_length_mm": 360,
            "max_cooler_height_mm": 170,
            "max_radiator_mm": 360,
            "psu_form_factor": PsuFormFactor.ATX,
            "supported_form_factors": [BoardFormFactor(code=c, width_mm=0, depth_mm=0) for c in form_factors],
        },
        kw,
    )


def cooler(sockets: tuple[str, ...] = ("AM4", "AM5", "LGA1700", "LGA1851"), **kw: Any) -> CoolerProduct:
    return _make(
        CoolerProduct,
        {
            "cooler_type": CoolerType.AIR,
            "height_mm": 155,
            "radiator_mm": None,
            "tdp_rating_w": None,
            "supported_sockets": [Socket(code=s, vendor="x") for s in sockets],
        },
        kw,
    )


def ctx(*products: Any, quantities: dict[int, int] | None = None) -> BuildContext:
    quantities = quantities or {}
    return BuildContext(Part(p, quantities.get(p.id, 1)) for p in products)


def full_build(**replace: Any) -> list[Any]:
    """A complete, compatible build; pass e.g. ``gpu=gpu(length_mm=400)`` or ``gpu=None``."""
    parts = {
        "cpu": cpu(),
        "motherboard": motherboard(),
        "memory": memory(),
        "gpu": gpu(),
        "storage": storage(),
        "psu": psu(),
        "case": case(),
        "cooler": cooler(),
    } | replace
    return [p for p in parts.values() if p is not None]
