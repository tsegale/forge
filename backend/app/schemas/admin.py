"""Administrator payloads."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ProductUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    price_cents: int | None = Field(
        default=None, strict=True, ge=0, le=2_147_483_647, description="Price in minor units (integer, never a float)."
    )
    is_active: bool | None = None

    @model_validator(mode="after")
    def _not_empty(self) -> ProductUpdate:
        if not self.model_fields_set:
            raise ValueError("Provide at least one field to update.")
        if any(getattr(self, name) is None for name in self.model_fields_set):
            raise ValueError("Fields cannot be set to null.")
        return self


class AdminProductResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sku: str
    name: str
    kind_code: str
    price_cents: int
    is_active: bool
    updated_at: datetime


class StockUpdate(BaseModel):
    """Only stock on hand is editable. Reserved stock belongs to checkout and changes only through it."""

    model_config = ConfigDict(extra="forbid")

    quantity_on_hand: int = Field(strict=True, ge=0, le=2_147_483_647)


class InventoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    product_id: int
    quantity_on_hand: int
    quantity_reserved: int
    quantity_available: int
    version: int = Field(description="Also returned as the ETag header. Send it back in If-Match to update.")
    updated_at: datetime


class AdminProductQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: str | None = None
    q: str | None = Field(default=None, max_length=100, description="Name or SKU contains.")
    active: bool | None = None
    limit: int = Field(default=50, ge=1, le=100)
    cursor: int | None = Field(default=None, ge=1)


class AdminProductRow(BaseModel):
    id: int
    sku: str
    name: str
    kind_code: str
    price_cents: int
    is_active: bool
    quantity_on_hand: int
    quantity_reserved: int
    quantity_available: int
    version: int = Field(description="Send as If-Match when editing this product's stock.")


class AdminProductPage(BaseModel):
    items: list[AdminProductRow]
    next_cursor: int | None
