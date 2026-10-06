"""Product reviews."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from .catalog import RatingSummary

Rating = Annotated[int, Field(strict=True, ge=1, le=5)]
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Body = Annotated[str, StringConstraints(strip_whitespace=True, min_length=10, max_length=5000)]


class ReviewCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rating: Rating
    title: Title | None = None
    body: Body


class ReviewUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rating: Rating | None = None
    title: Title | None = None
    body: Body | None = None


class ReviewResponse(BaseModel):
    id: int
    rating: int
    title: str | None
    body: str
    author: str = Field(description="First name and last initial, never the full name or email.")
    is_verified_purchase: bool = Field(description="Set by the database from the author's paid orders.")
    created_at: datetime
    updated_at: datetime


class RatingDistribution(RatingSummary):
    counts: dict[str, int] = Field(description="Reviews per star rating, keys '1' to '5'.")


ReviewSort = Literal["newest", "highest", "lowest"]


class ReviewQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sort: ReviewSort = "newest"
    verified_only: bool = False
    limit: int = Field(default=10, ge=1, le=50)
    cursor: str | None = Field(default=None, description="Opaque; from next_cursor of the previous page.")


class ReviewPage(BaseModel):
    summary: RatingDistribution = Field(description="Across all of the product's reviews, whatever the filter.")
    items: list[ReviewResponse]
    next_cursor: str | None
