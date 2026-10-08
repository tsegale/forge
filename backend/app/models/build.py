"""PC builds: a user's named configuration of components, validated by the compatibility engine."""

from __future__ import annotations

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    SmallInteger,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..extensions import db
from .catalog import Product
from .enums import BuildStatus, pg_enum
from .mixins import TimestampMixin


class Build(TimestampMixin, db.Model):
    """A user's PC build. Status moves draft -> validated -> ordered; database triggers reset a validated build to draft
    on any item change and refuse changes once it is ordered."""

    __tablename__ = "builds"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[BuildStatus] = mapped_column(
        pg_enum(BuildStatus, "build_status"), nullable=False, server_default=BuildStatus.DRAFT.value
    )
    is_public: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    share_slug: Mapped[str | None] = mapped_column(String(32), unique=True)
    # Shown on the home page. Featuring requires being public (CHECK); being validated is checked by the
    # featured query instead, because any edit returns a build to draft.
    is_featured: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    featured_blurb: Mapped[str | None] = mapped_column(String(200))

    items: Mapped[list[BuildItem]] = relationship(
        back_populates="build", cascade="all, delete-orphan", passive_deletes=True
    )

    __table_args__ = (
        CheckConstraint("NOT is_public OR share_slug IS NOT NULL", name="public_requires_slug"),
        CheckConstraint("NOT is_featured OR is_public", name="featured_requires_public"),
        Index("ix_builds_featured", "id", postgresql_where=text("is_featured")),
    )


class BuildItem(db.Model):
    """One part in a build. The composite FK to products(id, kind_code) lets the slot-limit trigger count parts per
    kind."""

    __tablename__ = "build_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    build_id: Mapped[int] = mapped_column(ForeignKey("builds.id", ondelete="CASCADE"), nullable=False)
    product_id: Mapped[int] = mapped_column(nullable=False)
    # Denormalised so slot limits can be enforced per kind; the composite FK below
    # guarantees it always equals the referenced product's real kind.
    kind_code: Mapped[str] = mapped_column(String(20), nullable=False)
    quantity: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default=text("1"))

    build: Mapped[Build] = relationship(back_populates="items")
    product: Mapped[Product] = relationship(primaryjoin="BuildItem.product_id == Product.id", foreign_keys=[product_id])

    @classmethod
    def for_product(cls, product: Product, quantity: int = 1) -> BuildItem:
        """A build item for ``product``, with its kind copied for the composite foreign key."""
        return cls(product=product, product_id=product.id, kind_code=product.kind_code, quantity=quantity)

    __table_args__ = (
        ForeignKeyConstraint(
            ["product_id", "kind_code"],
            ["products.id", "products.kind_code"],
            ondelete="RESTRICT",
            name="fk_build_items_product_kind",
        ),
        UniqueConstraint("build_id", "product_id", name="uq_build_items_build_product"),
        CheckConstraint("quantity > 0", name="quantity_positive"),
        Index("ix_build_items_build_kind", "build_id", "kind_code"),
    )
