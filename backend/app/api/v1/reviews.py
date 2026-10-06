"""Product reviews. Anyone can read them; a signed-in customer writes one per product."""

from __future__ import annotations

from flask import current_app, request

from ...extensions import limiter
from ...schemas.reviews import ReviewCreate, ReviewPage, ReviewQuery, ReviewResponse, ReviewUpdate
from ...security.guards import current_user, require_auth
from ...services import reviews as review_service
from ..spec import api, responses
from . import bp

TAG = "Reviews"
SECURITY = {"bearerAuth": []}


def _review_limit() -> str:
    return current_app.config["REVIEW_LIMIT_PER_USER"]


def _user_key() -> str:
    return f"user:{current_user().id}"


@bp.get("/products/<string:slug>/reviews")
@api.validate(query=ReviewQuery, resp=responses(400, 404, 422, HTTP_200=ReviewPage), tags=[TAG])
def list_reviews(slug: str):
    """A product's reviews with the rating distribution. Newest first by default; sort by
    rating or show verified purchases only. Keyset-paginated like the product list."""
    return review_service.list_reviews(slug, request.context.query)


@bp.get("/products/<string:slug>/reviews/mine")
@require_auth
@api.validate(resp=responses(401, 404, HTTP_200=ReviewResponse), tags=[TAG], security=SECURITY)
def my_review(slug: str):
    """The signed-in customer's review of this product (404 if they have not written one)."""
    return review_service.to_response(review_service.own_review(current_user(), slug))


@bp.post("/products/<string:slug>/reviews")
@require_auth
@limiter.limit(_review_limit, key_func=_user_key)
@api.validate(
    json=ReviewCreate, resp=responses(401, 404, 409, 422, 429, HTTP_201=ReviewResponse), tags=[TAG], security=SECURITY
)
def create_review(slug: str):
    """Review a product. One per customer per product (409 review_exists). The verified-purchase
    badge is set by the database from the customer's paid orders, not by the request."""
    review = review_service.create(current_user(), slug, request.context.json)
    return review_service.to_response(review), 201


@bp.patch("/reviews/<int:review_id>")
@require_auth
@api.validate(
    json=ReviewUpdate, resp=responses(401, 403, 404, 422, HTTP_200=ReviewResponse), tags=[TAG], security=SECURITY
)
def update_review(review_id: int):
    """Edit your own review."""
    return review_service.to_response(review_service.update(current_user(), review_id, request.context.json))


@bp.delete("/reviews/<int:review_id>")
@require_auth
@api.validate(resp=responses(401, 403, 404, HTTP_204=None), tags=[TAG], security=SECURITY)
def delete_review(review_id: int):
    """Delete your own review. Administrators may delete any review (moderation)."""
    review_service.delete(current_user(), review_id)
    return "", 204
