"""Identity: users, their addresses, and rotating refresh tokens."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    CHAR,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Uuid,
    text,
)
from sqlalchemy.dialects.postgresql import CITEXT
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..extensions import db
from .enums import AddressType, UserRole, pg_enum
from .mixins import TimestampMixin


class User(TimestampMixin, db.Model):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    # CITEXT: uniqueness is case-insensitive at the database level.
    email: Mapped[str] = mapped_column(CITEXT, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    first_name: Mapped[str] = mapped_column(String(80), nullable=False)
    last_name: Mapped[str] = mapped_column(String(80), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        pg_enum(UserRole, "user_role"), nullable=False, server_default=UserRole.CUSTOMER.value
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))

    addresses: Mapped[list[Address]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
    refresh_tokens: Mapped[list[RefreshToken]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )

    __table_args__ = (CheckConstraint("position('@' in email) > 1", name="email_format"),)


class Address(TimestampMixin, db.Model):
    __tablename__ = "addresses"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    type: Mapped[AddressType] = mapped_column(pg_enum(AddressType, "address_type"), nullable=False)
    recipient_name: Mapped[str] = mapped_column(String(160), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(32))
    line1: Mapped[str] = mapped_column(String(200), nullable=False)
    line2: Mapped[str | None] = mapped_column(String(200))
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    region: Mapped[str | None] = mapped_column(String(100))
    postal_code: Mapped[str | None] = mapped_column(String(20))
    country_code: Mapped[str] = mapped_column(CHAR(2), nullable=False, server_default="NA")
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))

    user: Mapped[User] = relationship(back_populates="addresses")

    __table_args__ = (
        # At most one default address per user per type, enforced by a partial unique index.
        Index(
            "uq_addresses_one_default_per_type",
            "user_id",
            "type",
            unique=True,
            postgresql_where=text("is_default"),
        ),
        CheckConstraint("country_code ~ '^[A-Z]{2}$'", name="country_code_iso"),
    )


class RefreshToken(db.Model):
    """Server-side record of issued refresh tokens: enables rotation, revocation and reuse detection."""

    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    jti: Mapped[uuid.UUID] = mapped_column(Uuid, unique=True, nullable=False)
    # Every token minted by rotating from one login shares a family. Presenting an already-rotated
    # token is treated as theft and revokes the whole family (RFC 9700 refresh token reuse detection).
    family_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    replaced_by_jti: Mapped[uuid.UUID | None] = mapped_column(Uuid)

    user: Mapped[User] = relationship(back_populates="refresh_tokens")

    __table_args__ = (
        CheckConstraint("expires_at > issued_at", name="expiry_after_issue"),
        CheckConstraint("replaced_by_jti IS NULL OR revoked_at IS NOT NULL", name="replaced_by_requires_revoked"),
    )


class PasswordResetToken(db.Model):
    """A single-use, short-lived password reset. Only a SHA-256 hash of the token is stored, so a
    database leak cannot be replayed into account takeovers. At most one unused token per user
    (partial unique index): asking again supersedes the previous link."""

    __tablename__ = "password_reset_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash: Mapped[str] = mapped_column(CHAR(64), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint("expires_at > created_at", name="expiry_after_creation"),
        CheckConstraint("token_hash ~ '^[0-9a-f]{64}$'", name="token_hash_hex"),
        Index("uq_password_reset_tokens_one_active", "user_id", unique=True, postgresql_where=text("used_at IS NULL")),
    )
