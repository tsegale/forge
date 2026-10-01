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
