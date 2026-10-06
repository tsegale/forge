"""Checkout and order payloads."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from ..models.enums import OrderStatus
from .addresses import AddressIn
from .cart import Totals
from .catalog import Price, ProductImageResponse


class BuildSource(BaseModel):
    model_config = ConfigDict(extra="forbid")

    build_id: int = Field(strict=True, ge=1)


class CheckoutRequest(BaseModel):
    """Check out the cart or a validated build, shipping to a saved or an inline address."""

    model_config = ConfigDict(extra="forbid")

    source: Literal["cart"] | BuildSource = "cart"
    address_id: int | None = Field(default=None, strict=True, ge=1)
    address: AddressIn | None = None

    @model_validator(mode="after")
    def _one_address(self) -> CheckoutRequest:
        if (self.address_id is None) == (self.address is None):
            raise ValueError("Provide exactly one of address_id or address.")
        return self


class OrderLine(BaseModel):
    product_id: int
    sku: str
    name: str
    quantity: int
    unit_price: Price = Field(description="Gross, VAT included, at the time of purchase.")
    line_total: Price
    kind: str = Field(description="The product's component kind (for its drawing when there is no photo).")
    image: ProductImageResponse | None = Field(
        description="The product's current first photo. Name, SKU and prices above are the purchase snapshot."
    )


class ShippingAddress(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    recipient_name: str
    phone: str | None
    line1: str
    line2: str | None
    city: str
    region: str | None
    postal_code: str | None
    country_code: str


class PaymentInfo(BaseModel):
    client_secret: str | None = Field(
        description="Pass to Stripe.js to confirm the payment. Null when the payment could not be started; "
        "retry with POST /orders/{order_number}/payment."
    )
    status: str


class OrderResponse(BaseModel):
    order_number: str
    status: OrderStatus
    items: list[OrderLine]
    totals: Totals
    shipping_address: ShippingAddress | None
    build_id: int | None
    reservation_expires_at: datetime | None = Field(description="Unpaid orders release their stock at this time.")
    created_at: datetime


class CheckoutResponse(OrderResponse):
    payment: PaymentInfo | None = None


class StatusChange(BaseModel):
    from_status: OrderStatus | None
    to_status: OrderStatus
    at: datetime


class OrderDetail(OrderResponse):
    payment_status: str | None = Field(description="Status of the latest payment attempt, if any.")
    history: list[StatusChange]


class OrderSummary(BaseModel):
    order_number: str
    status: OrderStatus
    item_count: int
    total: Price
    created_at: datetime


class OrderPage(BaseModel):
    items: list[OrderSummary]
    next_cursor: int | None = Field(description="Pass as `cursor` for older orders; null on the last page.")


class OrderListQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    limit: int = Field(default=20, ge=1, le=50)
    cursor: int | None = Field(default=None, ge=1)
    status: OrderStatus | None = None


FulfilmentStep = Literal["fulfilling", "shipped", "delivered"]


class AdminActions(BaseModel):
    """What an administrator may do next, from the database's state machine, so a client never
    has to know the rules to offer only legal actions."""

    next_steps: list[FulfilmentStep] = Field(
        description="Fulfilment statuses the order can move to now (POST .../status)."
    )
    refundable: bool = Field(
        description="A refund is allowed from the current status and there is a successful payment."
    )


class AdminOrderSummary(OrderSummary, AdminActions):
    customer_email: str


class AdminOrderPage(BaseModel):
    items: list[AdminOrderSummary]
    next_cursor: int | None = Field(description="Pass as `cursor` for older orders; null on the last page.")


class AdminOrderDetail(OrderDetail, AdminActions):
    customer_email: str


class AdminStatusChange(BaseModel):
    """Fulfilment steps. Payment, cancellation and refunds have their own paths."""

    model_config = ConfigDict(extra="forbid")

    to: FulfilmentStep


class RefundRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str | None = Field(default=None, max_length=500)
