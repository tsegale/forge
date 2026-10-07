"""Catalog payloads.

Specs are a discriminated union on ``kind``, so clients (and the OpenAPI document) know the exact
fields of each component kind. Money is integer minor units plus an ISO 4217 currency code.
"""

from __future__ import annotations

from datetime import datetime
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
from .findings import FindingResponse

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


class ProductImageResponse(BaseModel):
    thumb: str = Field(description="WebP, 320 px wide.")
    card: str = Field(description="WebP, 640 px wide.")
    full: str = Field(description="WebP, 1280 px wide (or the original width, if smaller).")
    alt: str
    width: int = Field(description="Intrinsic width of the full image, for layout without shift.")
    height: int


class RatingSummary(BaseModel):
    average: float | None = Field(description="Mean rating to one decimal place; null with no reviews.")
    count: int


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
    image: ProductImageResponse | None = Field(default=None, description="The first photo, if any.")
    compatibility_warnings: list[str] | None = Field(
        default=None,
        description="With compatible_with: warning codes this part would add to that build. Null otherwise.",
    )
    compatibility: CandidateCompatibility | None = Field(
        default=None,
        description="With compatible_with: how this part would fit that build, with the measured reasons. "
        "Null otherwise.",
    )


class CandidateCompatibility(BaseModel):
    compatible: bool = Field(
        description="Adding the part (or swapping it in, for a single-slot kind) adds no conflict."
    )
    conflicts: list[FindingResponse] = Field(
        description="Conflicts this part would cause; only listed with include_incompatible."
    )
    warnings: list[FindingResponse]


class ProductDetail(ProductSummary):
    description: str | None
    category: CategoryRef
    images: list[ProductImageResponse] = Field(description="Every photo, in display order.")
    rating: RatingSummary


class PriceHistoryQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    days: int = Field(default=90, ge=7, le=365, description="How far back to look.")


class PricePoint(BaseModel):
    at: datetime
    price_cents: int


class PriceHistoryResponse(BaseModel):
    currency: str
    days: int
    points: list[PricePoint] = Field(
        description="Each price in effect during the window, oldest first. The first point is the price "
        "at the start of the window; the price holds until the next point (a step series)."
    )
    current_cents: int
    lowest_cents: int
    highest_cents: int
    change_cents: int = Field(description="Current price minus the price at the start of the window.")


class CategoryList(BaseModel):
    items: list[CategoryNode]


class BrandList(BaseModel):
    items: list[BrandResponse]


# --------------------------------------------------------------------------- listing

SortOrder = Literal["relevance", "price", "-price", "name", "-name", "newest"]


class ProductFilters(BaseModel):
    """What selects products, shared by GET /products and GET /products/facets. Unknown parameters
    are rejected rather than ignored, so a misspelled filter fails loudly instead of silently
    returning unfiltered results."""

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


class ProductQuery(ProductFilters):
    """Query string for GET /products."""

    sort: SortOrder | None = Field(default=None, description="Defaults to relevance with q, otherwise name.")
    limit: int = Field(default=24, ge=1, le=100)
    cursor: str | None = Field(default=None, description="Opaque; from next_cursor of the previous page.")
    include_incompatible: bool = Field(
        default=False,
        description="With compatible_with: list conflicting parts too, each with `compatibility.conflicts` "
        "saying why, instead of leaving them out.",
    )

    @model_validator(mode="after")
    def _include_incompatible_needs_a_build(self) -> ProductQuery:
        if self.include_incompatible and self.compatible_with is None:
            raise ValueError("include_incompatible requires compatible_with.")
        return self


class ProductPage(BaseModel):
    items: list[ProductSummary]
    next_cursor: str | None = Field(description="Pass as `cursor` to fetch the next page; null on the last page.")


class BrandFacet(BaseModel):
    slug: str
    name: str
    count: int = Field(description="Matches with this brand, counting every other filter except brand.")


class KindFacet(BaseModel):
    kind: str
    count: int = Field(description="Matches of this kind, ignoring the kind and spec filters.")


class PriceRange(BaseModel):
    min_cents: int
    max_cents: int


class ProductFacets(BaseModel):
    total: int = Field(description="Products the same filters list (with compatible_with: the compatible ones).")
    incompatible: int | None = Field(
        description="With compatible_with: matching parts left out because they would conflict. Null otherwise."
    )
    in_stock: int = Field(description="Of the matches, how many are in stock (ignoring the in_stock filter).")
    kinds: list[KindFacet] = Field(description="Component kinds among the matches, most products first.")
    brands: list[BrandFacet] = Field(description="Brands among the matches, most products first.")
    price: PriceRange | None = Field(description="Price span of the matches, ignoring the price filters.")


class SuggestQuery(BaseModel):
    """Query string for GET /search/suggest."""

    model_config = ConfigDict(extra="forbid")

    q: str = Field(min_length=1, max_length=100, description="What the shopper has typed so far.")
    per_kind: int = Field(default=4, ge=1, le=8, description="Most products to return for each kind.")


class SuggestionGroup(BaseModel):
    kind: str
    total: int = Field(description="Matches of this kind; the group shows the best `per_kind` of them.")
    items: list[ProductSummary]


class SearchSuggestions(BaseModel):
    query: str
    total: int = Field(description="All matching products, across kinds.")
    groups: list[SuggestionGroup] = Field(description="Best matches per kind, most relevant kind first.")
    did_you_mean: str | None = Field(
        description="A corrected query built from catalog words when nothing matches, e.g. 'ryzen' for 'rizen'."
    )
