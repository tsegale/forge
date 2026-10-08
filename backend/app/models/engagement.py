"""Reviews and price-drop alerts."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..extensions import db
from .mixins import TimestampMixin


class Review(TimestampMixin, db.Model):
    """A customer's review of a product, one per user per product. ``is_verified_purchase`` is maintained by a trigger
    from the user's paid orders."""

    __tablename__ = "reviews"

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    rating: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    title: Mapped[str | None] = mapped_column(String(120))
    body: Mapped[str] = mapped_column(Text, nullable=False)
    # Set by trigger from the reviewer's paid orders; whatever the client sends is overwritten.
    is_verified_purchase: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))

    user = relationship("User")

    __table_args__ = (
        UniqueConstraint("product_id", "user_id", name="uq_reviews_one_per_user"),
        CheckConstraint("rating BETWEEN 1 AND 5", name="rating_range"),
        CheckConstraint("char_length(btrim(body)) >= 10", name="body_length"),
        Index("ix_reviews_product_created", "product_id", "created_at"),
    )


class PriceAlert(TimestampMixin, db.Model):
    """A request to email the user when a product's price falls to a target."""

    __tablename__ = "price_alerts"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    target_price_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    triggered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        UniqueConstraint("user_id", "product_id", name="uq_price_alerts_user_product"),
        CheckConstraint("target_price_cents > 0", name="target_positive"),
    )
