"""Checkout and order payloads."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from ..models.enums import OrderStatus
from .addresses import AddressIn
from .cart import Totals
from .catalog import Price


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
