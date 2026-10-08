"""Domain enums. Stored as native PostgreSQL enum types (lowercase values)."""

import enum

from sqlalchemy import Enum as SAEnum


def pg_enum(enum_cls: type[enum.Enum], name: str) -> SAEnum:
    """Native PG enum that persists the member *values*, not the Python names."""
    return SAEnum(
        enum_cls,
        name=name,
        values_callable=lambda members: [m.value for m in members],
        validate_strings=True,
    )


class UserRole(enum.StrEnum):
    """Account role used by role-based access control."""

    CUSTOMER = "customer"
    ADMIN = "admin"


class AddressType(enum.StrEnum):
    """What an address book entry is used for."""

    SHIPPING = "shipping"
    BILLING = "billing"


class KindCode(enum.StrEnum):
    """Polymorphic identities. Rows live in the component_kinds lookup table."""

    CPU = "cpu"
    MOTHERBOARD = "motherboard"
    MEMORY = "memory"
    GPU = "gpu"
    STORAGE = "storage"
    PSU = "psu"
    CASE = "case"
    COOLER = "cooler"
    ACCESSORY = "accessory"


class MemoryType(enum.StrEnum):
    """DDR generation shared by memory kits and motherboards."""

    DDR4 = "ddr4"
    DDR5 = "ddr5"


class PsuEfficiency(enum.StrEnum):
    """80 PLUS efficiency certification of a power supply."""

    WHITE = "80plus"
    BRONZE = "80plus_bronze"
    SILVER = "80plus_silver"
    GOLD = "80plus_gold"
    PLATINUM = "80plus_platinum"
    TITANIUM = "80plus_titanium"


class PsuAtxVersion(enum.StrEnum):
    """ATX 3.x supplies are specified to absorb power excursions of 200% of rated output
    (100 microseconds); ATX 2.x supplies make no such guarantee."""

    V2 = "2.x"
    V3_0 = "3.0"
    V3_1 = "3.1"


class PsuModularity(enum.StrEnum):
    """How a power supply's cables attach."""

    NON_MODULAR = "non_modular"
    SEMI_MODULAR = "semi_modular"
    FULLY_MODULAR = "fully_modular"


class PsuFormFactor(enum.StrEnum):
    """Power supply size standard; cases accept one of these."""

    ATX = "atx"
    SFX = "sfx"
    SFX_L = "sfx_l"


class CoolerType(enum.StrEnum):
    """Air tower or all-in-one liquid cooler."""

    AIR = "air"
    AIO = "aio"


class StorageInterface(enum.StrEnum):
    """Drive interface."""

    NVME = "nvme"
    SATA = "sata"


class StorageFormFactor(enum.StrEnum):
    """Physical drive size."""

    M2_2280 = "m2_2280"
    INCH_2_5 = "2.5in"
    INCH_3_5 = "3.5in"


class BuildStatus(enum.StrEnum):
    """Build lifecycle: draft, validated by the engine, or locked by an order."""

    DRAFT = "draft"
    VALIDATED = "validated"
    ORDERED = "ordered"


class OrderStatus(enum.StrEnum):
    """Order lifecycle; legal transitions live in the order_status_transitions table."""

    PENDING_PAYMENT = "pending_payment"
    PAID = "paid"
    FULFILLING = "fulfilling"
    SHIPPED = "shipped"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"
    REFUNDED = "refunded"


class ReservationStatus(enum.StrEnum):
    """Stock hold lifecycle: active, committed on payment, released or expired."""

    ACTIVE = "active"
    COMMITTED = "committed"
    RELEASED = "released"
    EXPIRED = "expired"


class PaymentStatus(enum.StrEnum):
    """Payment status, mirroring the provider's payment intent states."""

    REQUIRES_PAYMENT = "requires_payment"
    PROCESSING = "processing"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELED = "canceled"
    REFUNDED = "refunded"


class PaymentEventKind(enum.StrEnum):
    """Payment outcomes recorded in the append-only payment_events table, including those that are
    not order status changes (an amount mismatch, a late payment refunded on a cancelled order)."""

    INTENT_CREATED = "intent_created"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELED = "canceled"
    AMOUNT_MISMATCH = "amount_mismatch"
    LATE_PAYMENT_RESERVED = "late_payment_reserved"
    LATE_PAYMENT_REFUND_PENDING = "late_payment_refund_pending"
    LATE_PAYMENT_REFUNDED = "late_payment_refunded"
    REFUND_REQUESTED = "refund_requested"
    REFUNDED = "refunded"
    REFUND_FAILED = "refund_failed"
