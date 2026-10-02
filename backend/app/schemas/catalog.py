"""Catalog payloads.

Specs are a discriminated union on ``kind``, so clients (and the OpenAPI document) know the exact
fields of each component kind. Money is integer minor units plus an ISO 4217 currency code.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, field_validator, model_validator

from ..models.enums import (
    CoolerType,
    KindCode,
    MemoryType,
    PsuAtxVersion,
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
    includes_cooler: bool = Field(description="The retail box includes a cooler.")


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
    atx_version: PsuAtxVersion = Field(description="ATX 3.x supplies tolerate 200% power excursions.")


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
    compatibility_warnings: list[str] | None = Field(
        default=None,
        description="With compatible_with: warning codes this part would add to that build. Null otherwise.",
    )


class ProductDetail(ProductSummary):
    description: str | None
    category: CategoryRef


class CategoryList(BaseModel):
    items: list[CategoryNode]


class BrandList(BaseModel):
    items: list[BrandResponse]


# --------------------------------------------------------------------------- listing

SortOrder = Literal["relevance", "price", "-price", "name", "-name", "newest"]


class ProductQuery(BaseModel):
    """Query string for GET /products. Unknown parameters are rejected rather than ignored, so a
    misspelled filter fails loudly instead of silently returning unfiltered results."""

    model_config = ConfigDict(extra="forbid")

    q: str | None = Field(
        default=None, min_length=1, max_length=100, description="Search: words, model fragments (x3d) and typos."
    )
    kind: KindCode | None = None
    category: str | None = Field(default=None, description="Category slug; includes its subcategories.")
    brand: list[str] | None = Field(
        default=None, description="Brand slugs, comma-separated or repeated (brand=amd,intel or brand=amd&brand=intel)."
    )
    min_price: int | None = Field(default=None, ge=0, description="Inclusive, in minor units.")
    max_price: int | None = Field(default=None, ge=0, description="Inclusive, in minor units.")
    in_stock: bool | None = None
    sort: SortOrder | None = Field(default=None, description="Defaults to relevance with q, otherwise name.")
    limit: int = Field(default=24, ge=1, le=100)
    cursor: str | None = Field(default=None, description="Opaque; from next_cursor of the previous page.")
    compatible_with: list[int] | None = Field(
        default=None,
        max_length=50,
        description="Product ids of a build (comma-separated or repeated). Lists only parts of `kind` that "
        "would not conflict with it; a part of a single-slot kind (cpu, motherboard, psu, case, cooler) is "
        "judged as a replacement for the build's current one. Requires `kind`.",
    )

    # Spec filters. Each applies only to the kinds listed in its description; requires `kind`.
    socket: str | None = Field(default=None, description="cpu, motherboard, cooler (supported socket).")
    memory_type: MemoryType | None = Field(default=None, description="motherboard, memory.")
    form_factor: str | None = Field(
        default=None, description="motherboard (board), case (supported board), psu, storage."
    )
    chipset: str | None = Field(default=None, max_length=60, description="motherboard, gpu; substring match.")
    cores_min: int | None = Field(default=None, ge=1, description="cpu.")
    has_integrated_graphics: bool | None = Field(default=None, description="cpu.")
    capacity_min_gb: int | None = Field(default=None, ge=1, description="memory (kit total), storage.")
    speed_min_mts: int | None = Field(default=None, ge=1, description="memory.")
    vram_min_gb: int | None = Field(default=None, ge=1, description="gpu.")
    length_max_mm: int | None = Field(default=None, ge=1, description="gpu.")
    fits_gpu_length_mm: int | None = Field(default=None, ge=1, description="case: GPU clearance at least this.")
    fits_cooler_height_mm: int | None = Field(default=None, ge=1, description="case: cooler clearance at least this.")
    height_max_mm: int | None = Field(default=None, ge=1, description="cooler.")
    cooler_type: CoolerType | None = Field(default=None, description="cooler.")
    wattage_min_w: int | None = Field(default=None, ge=1, description="psu.")
    efficiency: PsuEfficiency | None = Field(default=None, description="psu.")
    modularity: PsuModularity | None = Field(default=None, description="psu.")
    interface: StorageInterface | None = Field(default=None, description="storage.")

    @field_validator("q", mode="before")
    @classmethod
    def _strip_q(cls, value: Any) -> Any:
        return value.strip() or None if isinstance(value, str) else value

    @field_validator("brand", "compatible_with", mode="before")
    @classmethod
    def _split_lists(cls, value: Any) -> Any:
        values = [value] if isinstance(value, str) else value
        if not isinstance(values, list):
            return value
        return [part.strip() for v in values for part in str(v).split(",") if part.strip()] or None

    @model_validator(mode="after")
    def _price_range(self) -> ProductQuery:
        if self.min_price is not None and self.max_price is not None and self.min_price > self.max_price:
            raise ValueError("min_price cannot be greater than max_price.")
        return self


class ProductPage(BaseModel):
    items: list[ProductSummary]
    next_cursor: str | None = Field(description="Pass as `cursor` to fetch the next page; null on the last page.")
