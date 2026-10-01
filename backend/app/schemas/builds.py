"""PC build payloads."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from ..models.enums import BuildStatus
from .catalog import Price, ProductSummary

BuildName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
# Accessories allow up to 20 per build; per-kind limits are enforced by the database.
Quantity = Annotated[int, Field(strict=True, ge=1, le=20)]


class BuildCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: BuildName


class BuildUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: BuildName


class BuildItemCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_id: int = Field(strict=True, ge=1)
    quantity: Quantity = 1


class BuildItemUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    quantity: Quantity


class BuildItemResponse(BaseModel):
    id: int
    quantity: int
    line_total: Price
    product: ProductSummary


class BuildSummary(BaseModel):
    id: int
    name: str
    status: BuildStatus
    item_count: int = Field(description="Total parts, counting quantities.")
    subtotal: Price
    updated_at: datetime


class BuildDetail(BuildSummary):
    items: list[BuildItemResponse]


class BuildList(BaseModel):
    items: list[BuildSummary]
