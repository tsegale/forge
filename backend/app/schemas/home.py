"""Home page collections: price drops, back in stock, featured builds."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from .builds import BuildDetail
from .catalog import Price, ProductSummary


class CollectionQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    limit: int = Field(default=8, ge=1, le=24)
    days: int = Field(default=30, ge=1, le=90, description="How recent the change must be.")


class PriceDrop(BaseModel):
    product: ProductSummary
    was: Price = Field(description="The price before the latest change.")
    saving_cents: int
    percent_off: int = Field(description="Whole percent, rounded down.")
    dropped_at: datetime


class PriceDropList(BaseModel):
    items: list[PriceDrop]


class BackInStock(BaseModel):
    product: ProductSummary
    restocked_at: datetime


class BackInStockList(BaseModel):
    items: list[BackInStock]


class FeaturedBuild(BuildDetail):
    blurb: str | None
    share_slug: str
    compatible: bool = Field(description="Always true: only validated builds are featured.")


class FeaturedBuildList(BaseModel):
    items: list[FeaturedBuild]
