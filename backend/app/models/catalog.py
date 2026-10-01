"""Catalog: lookup tables, the polymorphic product hierarchy, inventory and price history.

Design notes
------------
* ``products`` is the supertype; each core component kind has its own spec table mapped
  with SQLAlchemy joined-table inheritance (``polymorphic_on=kind_code``). Querying
  ``select(Product)`` returns ``CpuProduct``, ``GpuProduct``... instances.
* Exclusive subtypes are enforced by the database, not only the ORM: every spec table
  carries a constant ``kind_code`` column (CHECK = its own kind) and a composite foreign key
  to ``products(id, kind_code)``. A GPU product can therefore never gain a ``cpu_specs`` row.
* A product's category must be a leaf category of the same kind: composite FK
  ``(category_id, kind_code) -> categories(id, kind_code)``.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, ClassVar

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Computed,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Identity,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Table,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from ..extensions import db
from .enums import (
    CoolerType,
    KindCode,
    MemoryType,
    PsuEfficiency,
    PsuFormFactor,
    PsuModularity,
    StorageFormFactor,
    StorageInterface,
    pg_enum,
)
from .mixins import TimestampMixin

# --------------------------------------------------------------------------- lookups


class ComponentKind(db.Model):
    """Reference data: the kinds of part Forge sells and their per-build slot limits."""

    __tablename__ = "component_kinds"

    code: Mapped[str] = mapped_column(String(20), primary_key=True)
    label: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    max_per_build: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    required_in_build: Mapped[bool] = mapped_column(Boolean, nullable=False)
    sort_order: Mapped[int] = mapped_column(SmallInteger, nullable=False)

    __table_args__ = (CheckConstraint("max_per_build >= 1", name="max_per_build_positive"),)


class Socket(db.Model):
    __tablename__ = "sockets"

    code: Mapped[str] = mapped_column(String(20), primary_key=True)  # e.g. AM5, LGA1700
    vendor: Mapped[str] = mapped_column(String(20), nullable=False)


class BoardFormFactor(db.Model):
    __tablename__ = "board_form_factors"

    code: Mapped[str] = mapped_column(String(20), primary_key=True)  # ATX, Micro-ATX, Mini-ITX, E-ATX
    width_mm: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    depth_mm: Mapped[int] = mapped_column(SmallInteger, nullable=False)


class Brand(TimestampMixin, db.Model):
    __tablename__ = "brands"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    slug: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)


class Category(TimestampMixin, db.Model):
    """Browsing taxonomy (self-referencing tree). Only leaf categories carry a kind."""

    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id", ondelete="RESTRICT"))
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    kind_code: Mapped[str | None] = mapped_column(ForeignKey("component_kinds.code"))

    parent: Mapped[Category | None] = relationship(remote_side=[id], back_populates="children")
    children: Mapped[list[Category]] = relationship(back_populates="parent")

    __table_args__ = (
        UniqueConstraint("id", "kind_code", name="uq_categories_id_kind"),
        UniqueConstraint("parent_id", "name", name="uq_categories_sibling_name"),
        CheckConstraint("parent_id IS NULL OR parent_id <> id", name="not_own_parent"),
    )


# --------------------------------------------------------------------------- products


class Product(TimestampMixin, db.Model):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    sku: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    slug: Mapped[str] = mapped_column(String(220), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    brand_id: Mapped[int] = mapped_column(ForeignKey("brands.id", ondelete="RESTRICT"), nullable=False)
    category_id: Mapped[int] = mapped_column(nullable=False)
    kind_code: Mapped[str] = mapped_column(String(20), nullable=False)
    # Money is stored in integer minor units (cents), never floats.
    price_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    attributes: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    # Generated full-text search document, kept in sync by PostgreSQL itself.
    search_vector: Mapped[Any] = mapped_column(
        TSVECTOR,
        Computed(
            "setweight(to_tsvector('english'::regconfig, coalesce(name, '')), 'A') || "
            "setweight(to_tsvector('english'::regconfig, coalesce(sku, '')), 'B') || "
            "setweight(to_tsvector('english'::regconfig, coalesce(description, '')), 'C')",
            persisted=True,
        ),
    )

    brand: Mapped[Brand] = relationship(lazy="joined", innerjoin=True)
    category: Mapped[Category] = relationship(
        primaryjoin="Product.category_id == Category.id", foreign_keys=[category_id]
    )
    inventory: Mapped[Inventory] = relationship(back_populates="product", uselist=False)

    __table_args__ = (
        ForeignKeyConstraint(
            ["category_id", "kind_code"],
            ["categories.id", "categories.kind_code"],
            name="fk_products_category_kind",
        ),
        UniqueConstraint("id", "kind_code", name="uq_products_id_kind"),
        CheckConstraint("price_cents >= 0", name="price_non_negative"),
        Index("ix_products_search_vector", "search_vector", postgresql_using="gin"),
        Index("ix_products_attributes", "attributes", postgresql_using="gin"),
        Index("ix_products_kind_active_price", "kind_code", "is_active", "price_cents"),
        Index("ix_products_brand_id", "brand_id"),
        Index("ix_products_category_id", "category_id"),
    )
    __mapper_args__ = {"polymorphic_on": kind_code, "polymorphic_abstract": True}


def _spec_table_args(kind: KindCode, *extra: Any) -> tuple:
    """Constraints shared by every spec subtype table (exclusive-subtype enforcement)."""
    table = f"{kind.value}_specs"
    return (
        CheckConstraint(f"kind_code = '{kind.value}'", name="kind_matches_table"),
        ForeignKeyConstraint(
            ["product_id", "kind_code"],
            ["products.id", "products.kind_code"],
            ondelete="CASCADE",
            name=f"fk_{table}_product_kind",
        ),
        *extra,
    )


def _spec_kind_column(kind: KindCode) -> Mapped[str]:
    return mapped_column("kind_code", String(20), nullable=False, default=kind.value, server_default=kind.value)


class _SpecTable:
    """Mixin for spec subtypes. The spec table has two FKs to ``products`` (the plain PK
    link and the composite exclusive-subtype link), so the inherit condition is explicit."""

    __kind__: ClassVar[KindCode]

    @declared_attr.directive
    def __mapper_args__(cls) -> dict[str, Any]:
        return {
            "polymorphic_identity": cls.__kind__.value,
            "inherit_condition": cls.__table__.c.product_id == Product.__table__.c.id,
        }


class CpuProduct(_SpecTable, Product):
    __tablename__ = "cpu_specs"

    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), primary_key=True)
    spec_kind: Mapped[str] = _spec_kind_column(KindCode.CPU)
    socket_code: Mapped[str] = mapped_column(ForeignKey("sockets.code"), nullable=False, index=True)
    cores: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    threads: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    base_clock_mhz: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    boost_clock_mhz: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    tdp_w: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    # Sustained package limit (AMD PPT / Intel MTP): what the PSU actually has to feed.
    max_power_w: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    has_integrated_graphics: Mapped[bool] = mapped_column(Boolean, nullable=False)

    socket: Mapped[Socket] = relationship()

    __table_args__ = _spec_table_args(
        KindCode.CPU,
        CheckConstraint("threads >= cores AND cores > 0", name="threads_ge_cores"),
        CheckConstraint("boost_clock_mhz >= base_clock_mhz", name="boost_ge_base"),
        CheckConstraint("max_power_w >= tdp_w", name="max_power_ge_tdp"),
    )
    __kind__ = KindCode.CPU


class MotherboardProduct(_SpecTable, Product):
    __tablename__ = "motherboard_specs"

    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), primary_key=True)
    spec_kind: Mapped[str] = _spec_kind_column(KindCode.MOTHERBOARD)
    socket_code: Mapped[str] = mapped_column(ForeignKey("sockets.code"), nullable=False, index=True)
    form_factor_code: Mapped[str] = mapped_column(ForeignKey("board_form_factors.code"), nullable=False, index=True)
    chipset: Mapped[str] = mapped_column(String(20), nullable=False)
    memory_type: Mapped[MemoryType] = mapped_column(pg_enum(MemoryType, "memory_type"), nullable=False, index=True)
    memory_slots: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    max_memory_gb: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    m2_slots: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    sata_ports: Mapped[int] = mapped_column(SmallInteger, nullable=False)

    socket: Mapped[Socket] = relationship()
    form_factor: Mapped[BoardFormFactor] = relationship()

    __table_args__ = _spec_table_args(
        KindCode.MOTHERBOARD,
        CheckConstraint("memory_slots IN (2, 4, 8)", name="memory_slots_valid"),
        CheckConstraint("m2_slots >= 0 AND sata_ports >= 0", name="storage_ports_non_negative"),
    )
    __kind__ = KindCode.MOTHERBOARD


class MemoryProduct(_SpecTable, Product):
    __tablename__ = "memory_specs"

    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), primary_key=True)
    spec_kind: Mapped[str] = _spec_kind_column(KindCode.MEMORY)
    memory_type: Mapped[MemoryType] = mapped_column(pg_enum(MemoryType, "memory_type"), nullable=False, index=True)
    modules: Mapped[int] = mapped_column(SmallInteger, nullable=False)  # sticks per kit
    module_capacity_gb: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    speed_mts: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    cas_latency: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    height_mm: Mapped[Decimal] = mapped_column(Numeric(4, 1), nullable=False)
    total_capacity_gb: Mapped[int] = mapped_column(
        SmallInteger, Computed("modules * module_capacity_gb", persisted=True)
    )

    __table_args__ = _spec_table_args(KindCode.MEMORY, CheckConstraint("modules BETWEEN 1 AND 8", name="modules_range"))
    __kind__ = KindCode.MEMORY


class GpuProduct(_SpecTable, Product):
    __tablename__ = "gpu_specs"

    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), primary_key=True)
    spec_kind: Mapped[str] = _spec_kind_column(KindCode.GPU)
    chipset: Mapped[str] = mapped_column(String(60), nullable=False)  # e.g. GeForce RTX 5080
    vram_gb: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    length_mm: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    slot_width: Mapped[Decimal] = mapped_column(Numeric(3, 1), nullable=False)
    tdp_w: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    power_connectors: Mapped[str] = mapped_column(String(60), nullable=False)
    recommended_psu_w: Mapped[int] = mapped_column(SmallInteger, nullable=False)

    __table_args__ = _spec_table_args(
        KindCode.GPU, CheckConstraint("length_mm > 0 AND tdp_w > 0", name="dimensions_positive")
    )
    __kind__ = KindCode.GPU


class StorageProduct(_SpecTable, Product):
    __tablename__ = "storage_specs"

    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), primary_key=True)
    spec_kind: Mapped[str] = _spec_kind_column(KindCode.STORAGE)
    interface: Mapped[StorageInterface] = mapped_column(pg_enum(StorageInterface, "storage_interface"), nullable=False)
    form_factor: Mapped[StorageFormFactor] = mapped_column(
        pg_enum(StorageFormFactor, "storage_form_factor"), nullable=False
    )
    capacity_gb: Mapped[int] = mapped_column(Integer, nullable=False)
    pcie_gen: Mapped[int | None] = mapped_column(SmallInteger)

    __table_args__ = _spec_table_args(
        KindCode.STORAGE,
        CheckConstraint(
            "(interface = 'nvme' AND form_factor = 'm2_2280' AND pcie_gen IS NOT NULL) "
            "OR (interface = 'sata' AND pcie_gen IS NULL)",
            name="interface_consistent",
        ),
    )
    __kind__ = KindCode.STORAGE


class PsuProduct(_SpecTable, Product):
    __tablename__ = "psu_specs"

    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), primary_key=True)
    spec_kind: Mapped[str] = _spec_kind_column(KindCode.PSU)
    wattage_w: Mapped[int] = mapped_column(SmallInteger, nullable=False, index=True)
    efficiency: Mapped[PsuEfficiency] = mapped_column(pg_enum(PsuEfficiency, "psu_efficiency"), nullable=False)
    modularity: Mapped[PsuModularity] = mapped_column(pg_enum(PsuModularity, "psu_modularity"), nullable=False)
    form_factor: Mapped[PsuFormFactor] = mapped_column(pg_enum(PsuFormFactor, "psu_form_factor"), nullable=False)
    has_12v_2x6: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))

    __table_args__ = _spec_table_args(KindCode.PSU, CheckConstraint("wattage_w >= 300", name="wattage_min"))
    __kind__ = KindCode.PSU


case_supported_form_factors = Table(
    "case_supported_form_factors",
    db.Model.metadata,
    Column("case_product_id", ForeignKey("case_specs.product_id", ondelete="CASCADE"), primary_key=True),
    Column("form_factor_code", ForeignKey("board_form_factors.code"), primary_key=True),
)


class CaseProduct(_SpecTable, Product):
    __tablename__ = "case_specs"

    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), primary_key=True)
    spec_kind: Mapped[str] = _spec_kind_column(KindCode.CASE)
    max_gpu_length_mm: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    max_cooler_height_mm: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    max_radiator_mm: Mapped[int | None] = mapped_column(SmallInteger)
    psu_form_factor: Mapped[PsuFormFactor] = mapped_column(pg_enum(PsuFormFactor, "psu_form_factor"), nullable=False)

    supported_form_factors: Mapped[list[BoardFormFactor]] = relationship(
        secondary=case_supported_form_factors, lazy="selectin"
    )

    __table_args__ = _spec_table_args(KindCode.CASE)
    __kind__ = KindCode.CASE


cooler_supported_sockets = Table(
    "cooler_supported_sockets",
    db.Model.metadata,
    Column("cooler_product_id", ForeignKey("cooler_specs.product_id", ondelete="CASCADE"), primary_key=True),
    Column("socket_code", ForeignKey("sockets.code"), primary_key=True),
)


class CoolerProduct(_SpecTable, Product):
    __tablename__ = "cooler_specs"

    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), primary_key=True)
    spec_kind: Mapped[str] = _spec_kind_column(KindCode.COOLER)
    cooler_type: Mapped[CoolerType] = mapped_column(pg_enum(CoolerType, "cooler_type"), nullable=False)
    height_mm: Mapped[int | None] = mapped_column(SmallInteger)
    radiator_mm: Mapped[int | None] = mapped_column(SmallInteger)
    tdp_rating_w: Mapped[int | None] = mapped_column(SmallInteger)

    supported_sockets: Mapped[list[Socket]] = relationship(secondary=cooler_supported_sockets, lazy="selectin")

    __table_args__ = _spec_table_args(
        KindCode.COOLER,
        CheckConstraint(
            "(cooler_type = 'air' AND height_mm IS NOT NULL AND radiator_mm IS NULL) "
            "OR (cooler_type = 'aio' AND radiator_mm IN (120, 140, 240, 280, 360, 420))",
            name="type_dimensions_consistent",
        ),
    )
    __kind__ = KindCode.COOLER


class AccessoryProduct(Product):
    """No spec table: fans, paste, cables keep their loose attributes in products.attributes (JSONB)."""

    __mapper_args__ = {"polymorphic_identity": KindCode.ACCESSORY.value}


# --------------------------------------------------------------------------- stock & pricing


class Inventory(db.Model):
    """One row per product, created by a database trigger when the product is inserted."""

    __tablename__ = "inventory"

    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), primary_key=True)
    quantity_on_hand: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    quantity_reserved: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    version: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("1"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), onupdate=text("now()"), nullable=False
    )

    product: Mapped[Product] = relationship(back_populates="inventory")

    @property
    def quantity_available(self) -> int:
        return self.quantity_on_hand - self.quantity_reserved

    __table_args__ = (
        CheckConstraint("quantity_on_hand >= 0", name="on_hand_non_negative"),
        CheckConstraint("quantity_reserved >= 0", name="reserved_non_negative"),
        CheckConstraint("quantity_reserved <= quantity_on_hand", name="reserved_le_on_hand"),
    )
    # ORM-level optimistic concurrency for admin edits; checkout uses SELECT ... FOR UPDATE.
    __mapper_args__ = {"version_id_col": version}


class PriceHistory(db.Model):
    """Range-partitioned by month. Rows are written by a trigger on products.price_cents."""

    __tablename__ = "price_history"

    id: Mapped[int] = mapped_column(Integer, Identity(always=True), primary_key=True)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), primary_key=True, server_default=text("now()")
    )
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    price_cents: Mapped[int] = mapped_column(Integer, nullable=False)

    __table_args__ = (
        Index("ix_price_history_product_recorded", "product_id", "recorded_at"),
        {"postgresql_partition_by": "RANGE (recorded_at)"},
    )
