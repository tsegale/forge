"""Catalog payloads.

Specs are a discriminated union on ``kind``, so clients (and the OpenAPI document) know the exact
fields of each component kind. Money is integer minor units plus an ISO 4217 currency code.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, field_validator

from ..models.enums import (
    CoolerType,
    MemoryType,
    PsuEfficiency,
    PsuFormFactor,
    PsuModularity,
    StorageFormFactor,
    StorageInterface,
)

# Physical dimensions (not money) stored as NUMERIC: emit as JSON numbers rather than strings.
Millimetres = Annotated[Decimal, PlainSerializer(float, return_type=float, when_used="json")]


class _Orm(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class BrandResponse(_Orm):
    id: int
    name: str
    slug: str


class CategoryNode(BaseModel):
    id: int
    name: str
    slug: str
    kind: str | None = Field(description="Component kind sold in this category; null for grouping categories.")
    children: list[CategoryNode] = []


class CategoryRef(_Orm):
    id: int
    name: str
    slug: str


# --------------------------------------------------------------------------- specs


class CpuSpecs(_Orm):
    kind: Literal["cpu"] = "cpu"
    socket_code: str
    cores: int
    threads: int
    base_clock_mhz: int
    boost_clock_mhz: int
    tdp_w: int
    max_power_w: int
    has_integrated_graphics: bool


class MotherboardSpecs(_Orm):
    kind: Literal["motherboard"] = "motherboard"
    socket_code: str
    form_factor_code: str
    chipset: str
    memory_type: MemoryType
    memory_slots: int
    max_memory_gb: int
    m2_slots: int
    sata_ports: int


class MemorySpecs(_Orm):
    kind: Literal["memory"] = "memory"
    memory_type: MemoryType
    modules: int
    module_capacity_gb: int
    total_capacity_gb: int
    speed_mts: int
    cas_latency: int
    height_mm: Millimetres


class GpuSpecs(_Orm):
    kind: Literal["gpu"] = "gpu"
    chipset: str
    vram_gb: int
    length_mm: int
    slot_width: Millimetres
    tdp_w: int
    power_connectors: str
    recommended_psu_w: int


class StorageSpecs(_Orm):
    kind: Literal["storage"] = "storage"
    interface: StorageInterface
    form_factor: StorageFormFactor
    capacity_gb: int
    pcie_gen: int | None


class PsuSpecs(_Orm):
    kind: Literal["psu"] = "psu"
    wattage_w: int
    efficiency: PsuEfficiency
    modularity: PsuModularity
    form_factor: PsuFormFactor
    has_12v_2x6: bool


class CaseSpecs(_Orm):
    kind: Literal["case"] = "case"
    max_gpu_length_mm: int
    max_cooler_height_mm: int
    max_radiator_mm: int | None
    psu_form_factor: PsuFormFactor
    supported_form_factors: list[str]

    @field_validator("supported_form_factors", mode="before")
    @classmethod
    def _codes(cls, value: list[Any]) -> list[str]:
        return sorted(getattr(v, "code", v) for v in value)


class CoolerSpecs(_Orm):
    kind: Literal["cooler"] = "cooler"
    cooler_type: CoolerType
    height_mm: int | None
    radiator_mm: int | None
    tdp_rating_w: int | None
    supported_sockets: list[str]

    @field_validator("supported_sockets", mode="before")
    @classmethod
    def _codes(cls, value: list[Any]) -> list[str]:
        return sorted(getattr(v, "code", v) for v in value)


class AccessorySpecs(BaseModel):
    kind: Literal["accessory"] = "accessory"
    attributes: dict[str, Any]


Specs = Annotated[
    CpuSpecs
    | MotherboardSpecs
    | MemorySpecs
    | GpuSpecs
    | StorageSpecs
    | PsuSpecs
    | CaseSpecs
    | CoolerSpecs
    | AccessorySpecs,
    Field(discriminator="kind"),
]

SPEC_MODELS: dict[str, type[BaseModel]] = {
    "cpu": CpuSpecs,
    "motherboard": MotherboardSpecs,
    "memory": MemorySpecs,
    "gpu": GpuSpecs,
    "storage": StorageSpecs,
    "psu": PsuSpecs,
    "case": CaseSpecs,
    "cooler": CoolerSpecs,
}


# --------------------------------------------------------------------------- products


class Price(BaseModel):
    amount_cents: int = Field(description="Integer minor units.")
    currency: str = Field(description="ISO 4217 code, lowercase.")


class Availability(BaseModel):
    in_stock: bool
    quantity_available: int


class ProductSummary(BaseModel):
    id: int
    sku: str
    slug: str
    name: str
    kind: str
    brand: BrandResponse
    price: Price
    availability: Availability
    specs: Specs


class ProductDetail(ProductSummary):
    description: str | None
    category: CategoryRef


class CategoryList(BaseModel):
    items: list[CategoryNode]


class BrandList(BaseModel):
    items: list[BrandResponse]
