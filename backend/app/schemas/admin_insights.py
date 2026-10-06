"""Back-office views: sales metrics, the webhook ledger and the audit trail."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from ..models.enums import OrderStatus
from .catalog import Price


class MetricsQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    days: int = Field(default=30, ge=1, le=90)


class DailySales(BaseModel):
    day: date = Field(description="Calendar day in the store's time zone.")
    revenue: Price
    orders: int


class StatusCount(BaseModel):
    status: OrderStatus
    count: int


class LowStock(BaseModel):
    product_id: int
    sku: str
    name: str
    available: int


class TopProduct(BaseModel):
    product_id: int
    sku: str
    name: str
    units: int
    revenue: Price


class Metrics(BaseModel):
    days: int
    revenue: Price = Field(description="Paid orders placed in the window (paid through delivered), VAT included.")
    orders: int
    average_order: Price | None
    units: int
    refunded: Price = Field(description="Orders placed in the window and since refunded.")
    awaiting_payment: int = Field(description="Orders holding stock until they are paid or expire.")
    daily: list[DailySales] = Field(description="One entry per day of the window, oldest first, zeros included.")
    by_status: list[StatusCount] = Field(description="Orders placed in the window, per current status.")
    low_stock: list[LowStock] = Field(description="Active products with three or fewer available.")
    top_products: list[TopProduct] = Field(description="Best sellers in the window by revenue.")


class LogQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    limit: int = Field(default=50, ge=1, le=200)
    before: datetime | None = Field(default=None, description="Only entries before this time (from next_before).")


AuditKind = Literal["orders", "stock", "prices", "payments"]


class AuditQuery(LogQuery):
    kind: AuditKind | None = Field(default=None, description="One source only; all of them by default.")


class WebhookEntry(BaseModel):
    provider: str
    event_id: str
    event_type: str
    processed_at: datetime
    order_number: str | None = Field(description="From the event's metadata, when it names an order.")


class WebhookLog(BaseModel):
    items: list[WebhookEntry]
    next_before: datetime | None


class AuditEntry(BaseModel):
    kind: AuditKind
    at: datetime
    subject: str = Field(description="The order number, or the product's SKU.")
    summary: str
    actor: str | None = Field(description="Who did it (an administrator); null for the system or the customer.")
    details: dict[str, Any]


class AuditLog(BaseModel):
    items: list[AuditEntry]
    next_before: datetime | None
