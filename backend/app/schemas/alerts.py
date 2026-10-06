"""Price-drop alerts."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from .catalog import Price, ProductSummary


class PriceAlertCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_id: int = Field(strict=True, ge=1)
    target_price_cents: int = Field(strict=True, ge=1, description="Email when the price is at or below this.")


class PriceAlertResponse(BaseModel):
    id: int
    product: ProductSummary
    target: Price
    triggered_at: datetime | None = Field(description="When the drop email went out; null while waiting.")
    created_at: datetime


class PriceAlertList(BaseModel):
    items: list[PriceAlertResponse]
