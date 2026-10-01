"""Cart payloads, and the totals block shared with orders."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from .catalog import Price, ProductSummary


class Totals(BaseModel):
    """VAT-inclusive pricing: total = subtotal + tax + shipping, exactly."""

    subtotal: Price = Field(description="Goods, net of VAT.")
    shipping: Price = Field(description="Shipping, net of VAT.")
    tax: Price = Field(description="VAT on goods and shipping (15%).")
    total: Price = Field(description="What the customer pays.")


class CartLine(BaseModel):
    id: int
    quantity: int
    line_total: Price = Field(description="Gross, VAT included.")
    in_stock: bool = Field(description="False if the quantity exceeds what is available right now.")
    product: ProductSummary


class CartResponse(BaseModel):
    items: list[CartLine]
    item_count: int
    totals: Totals


class CartItemCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_id: int = Field(strict=True, ge=1)
    quantity: int = Field(default=1, strict=True, ge=1, le=99)


class CartItemUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    quantity: int = Field(strict=True, ge=1, le=99)
