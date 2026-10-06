"""Product reviews: one per customer per product, verified-purchase badge set by the database."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from flask import current_app
from itsdangerous import BadSignature, URLSafeSerializer
from sqlalchemy import Select, func, select, tuple_
from sqlalchemy.orm import joinedload

from ..errors import BadRequest, Forbidden, NotFound
from ..extensions import db
from ..models import Review, User
from ..models.enums import UserRole
from ..schemas.reviews import (
    RatingDistribution,
    ReviewCreate,
    ReviewPage,
    ReviewQuery,
    ReviewResponse,
    ReviewSort,
    ReviewUpdate,
)
from .catalog import get_active, rating_summary

# Sort -> (column, descending). Ties fall back to id in the same direction, so pages never overlap.
_SORTS: dict[ReviewSort, tuple[Any, bool]] = {
    "newest": (Review.created_at, True),
    "highest": (Review.rating, True),
    "lowest": (Review.rating, False),
}


def _author(user: User) -> str:
    initial = f" {user.last_name[:1].upper()}." if user.last_name else ""
    return f"{user.first_name}{initial}"


def to_response(review: Review) -> ReviewResponse:
    return ReviewResponse(
        id=review.id,
        rating=review.rating,
        title=review.title,
        body=review.body,
        author=_author(review.user),
        is_verified_purchase=review.is_verified_purchase,
        created_at=review.created_at,
        updated_at=review.updated_at,
    )


def _serializer() -> URLSafeSerializer:
    return URLSafeSerializer(current_app.config["SECRET_KEY"], salt="forge.reviews.cursor")


def _cursor_key(query: ReviewQuery, product_id: int) -> str:
    return f"{product_id}:{query.sort}:{int(query.verified_only)}"


def _decode_cursor(query: ReviewQuery, product_id: int) -> tuple[Any, int] | None:
    if query.cursor is None:
        return None
    try:
        payload = _serializer().loads(query.cursor)
        if payload["q"] != _cursor_key(query, product_id):
            raise BadRequest("The cursor belongs to a different query.", code="cursor_mismatch")
        value, last_id = payload["k"]
        return value, int(last_id)
    except BadRequest:
        raise
    except (BadSignature, KeyError, TypeError, ValueError) as exc:
        raise BadRequest("The cursor is invalid.", code="invalid_cursor") from exc


def distribution(product_id: int) -> RatingDistribution:
    rows = dict(
        db.session.execute(
            select(Review.rating, func.count()).where(Review.product_id == product_id).group_by(Review.rating)
        ).all()
    )
    overall = rating_summary(product_id)  # one rounding rule (PostgreSQL's) for every average shown
    return RatingDistribution(
        average=overall.average, count=overall.count, counts={str(r): rows.get(r, 0) for r in range(1, 6)}
    )


def list_reviews(slug: str, query: ReviewQuery) -> ReviewPage:
    product = get_active(slug)
    column, descending = _SORTS[query.sort]
    stmt: Select[tuple[Review]] = select(Review).where(Review.product_id == product.id).options(joinedload(Review.user))
    if query.verified_only:
        stmt = stmt.where(Review.is_verified_purchase)
    after = _decode_cursor(query, product.id)
    if after is not None:
        value, last_id = after
        if column is Review.created_at:
            value = datetime.fromisoformat(value)
        row = tuple_(column, Review.id)
        stmt = stmt.where(row < tuple_(value, last_id) if descending else row > tuple_(value, last_id))
    order = (column.desc(), Review.id.desc()) if descending else (column.asc(), Review.id.asc())
    reviews = db.session.scalars(stmt.order_by(*order).limit(query.limit + 1)).all()

    page, has_more = reviews[: query.limit], len(reviews) > query.limit
    next_cursor = None
    if has_more and page:
        last = page[-1]
        key = last.created_at.isoformat() if column is Review.created_at else last.rating
        next_cursor = _serializer().dumps({"q": _cursor_key(query, product.id), "k": [key, last.id]})
    return ReviewPage(summary=distribution(product.id), items=[to_response(r) for r in page], next_cursor=next_cursor)


def own_review(user: User, slug: str) -> Review | None:
    product = get_active(slug)
    return db.session.scalar(select(Review).where(Review.product_id == product.id, Review.user_id == user.id))


def create(user: User, slug: str, data: ReviewCreate) -> Review:
    """One review per customer per product (uq_reviews_one_per_user maps to 409 review_exists)."""
    product = get_active(slug)
    review = Review(product_id=product.id, user_id=user.id, rating=data.rating, title=data.title, body=data.body)
    db.session.add(review)
    db.session.commit()
    db.session.refresh(review)  # is_verified_purchase was decided by the trigger
    return review


def _owned(user: User, review_id: int) -> Review:
    review = db.session.get(Review, review_id)
    if review is None:
        raise NotFound("Review not found.")
    if review.user_id != user.id:
        # Admins may remove reviews (moderation) but never edit someone else's words.
        raise Forbidden("You can only change your own reviews.")
    return review


def update(user: User, review_id: int, data: ReviewUpdate) -> Review:
    review = _owned(user, review_id)
    for field in data.model_fields_set:
        value = getattr(data, field)
        if value is None and field in {"rating", "body"}:
            continue  # required fields: null means "leave as is"
        setattr(review, field, value)
    db.session.commit()
    db.session.refresh(review)
    return review


def delete(user: User, review_id: int) -> None:
    review = db.session.get(Review, review_id)
    if review is None:
        raise NotFound("Review not found.")
    if review.user_id != user.id and user.role is not UserRole.ADMIN:
        raise Forbidden("You can only delete your own reviews.")
    db.session.delete(review)
    db.session.commit()
