"""Reference data and runtime settings the frontend needs."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class ComponentKindResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str
    label: str
    max_per_build: int
    required_in_build: bool
    sort_order: int


class ComponentKindList(BaseModel):
    items: list[ComponentKindResponse]


class ShippingSettings(BaseModel):
    flat_cents: int = Field(description="VAT-inclusive flat fee.")
    free_threshold_cents: int = Field(description="Goods total (gross) from which shipping is free.")


class PublicConfig(BaseModel):
    currency: str
    vat_rate_bps: int = Field(description="1500 = 15%. Prices are VAT-inclusive.")
    shipping: ShippingSettings
    reservation_ttl_seconds: int = Field(description="How long checkout holds stock for payment.")
    stripe_publishable_key: str | None = Field(description="Null when payments are not configured.")
