"""Translate PostgreSQL errors into precise HTTP errors.

The database is the source of truth for business rules (constraints and triggers). When one
is violated, PostgreSQL reports the constraint name (``diag.constraint_name``); triggers raise
with ``CONSTRAINT = '...'`` so they report one too. Names follow the naming convention in
``app/extensions.py``, so they are stable keys for this table.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.exc import DBAPIError


@dataclass(frozen=True, slots=True)
class MappedError:
    status: int
    code: str
    message: str


CONSTRAINT_ERRORS: dict[str, MappedError] = {
    # identity
    "uq_users_email": MappedError(409, "email_taken", "An account with this email address already exists."),
    "ck_users_email_format": MappedError(422, "invalid_email", "The email address is not valid."),
    "uq_addresses_one_default_per_type": MappedError(
        409, "default_address_exists", "A default address of this type already exists."
    ),
    # catalog
    "uq_products_sku": MappedError(409, "sku_taken", "A product with this SKU already exists."),
    "uq_products_slug": MappedError(409, "slug_taken", "A product with this name already exists."),
    "uq_brands_name": MappedError(409, "brand_exists", "A brand with this name already exists."),
    "uq_brands_slug": MappedError(409, "brand_exists", "A brand with this name already exists."),
    "uq_categories_slug": MappedError(409, "category_exists", "A category with this slug already exists."),
    "ck_products_price_non_negative": MappedError(422, "invalid_price", "Price cannot be negative."),
    # stock
    "ck_inventory_on_hand_non_negative": MappedError(422, "invalid_stock", "Stock on hand cannot be negative."),
    "ck_inventory_reserved_le_on_hand": MappedError(
        409, "stock_below_reserved", "Stock on hand cannot be lower than the quantity currently reserved."
    ),
    # builds (trigger-raised)
    "build_slot_limit": MappedError(
        409, "build_slot_limit", "This build already holds the maximum number of parts of this kind."
    ),
    "uq_build_items_build_product": MappedError(409, "duplicate_build_item", "This part is already in the build."),
    "build_locked": MappedError(409, "build_locked", "This build has been ordered and its parts can no longer change."),
    # orders (trigger-raised)
    "order_status_transition": MappedError(
        409, "invalid_status_transition", "The order cannot move to that status from its current status."
    ),
    # cart
    "ck_cart_items_quantity_range": MappedError(422, "cart_quantity_limit", "A cart line can hold 1 to 99 units."),
    # checkout and payments (trigger-raised, migration 0005)
    "order_payment_required": MappedError(
        409, "payment_required", "The order cannot be marked paid without a matching successful payment."
    ),
    "reservation_transition": MappedError(
        409, "invalid_reservation_state", "The stock reservation cannot change that way in its current state."
    ),
    # engagement
    "uq_reviews_one_per_user": MappedError(409, "review_exists", "You have already reviewed this product."),
    "ck_reviews_rating_range": MappedError(422, "invalid_rating", "Rating must be between 1 and 5."),
    "uq_price_alerts_user_product": MappedError(
        409, "price_alert_exists", "You already have a price alert for this product."
    ),
}

# Fallbacks by SQLSTATE when a constraint is not individually mapped.
SQLSTATE_ERRORS: dict[str, MappedError] = {
    "23505": MappedError(409, "conflict", "A record with these values already exists."),
    "23503": MappedError(
        409, "reference_conflict", "The request references a record that does not exist or is in use."
    ),
    "23514": MappedError(422, "constraint_violation", "The request violates a data constraint."),
    "23502": MappedError(422, "missing_value", "A required value is missing."),
    "23P01": MappedError(409, "conflict", "The request conflicts with an existing record."),
    "55000": MappedError(409, "invalid_state", "The record cannot be changed in its current state."),
    "40001": MappedError(409, "serialization_failure", "The request conflicted with a concurrent update. Retry it."),
    "40P01": MappedError(409, "deadlock_detected", "The request conflicted with a concurrent update. Retry it."),
}

_UNAVAILABLE = MappedError(503, "service_unavailable", "The database is temporarily unavailable.")


def map_database_error(exc: DBAPIError) -> MappedError | None:
    """Return the HTTP mapping for a database error, or ``None`` if it is a genuine bug."""
    orig = exc.orig
    diag = getattr(orig, "diag", None)
    constraint = getattr(diag, "constraint_name", None)
    if constraint and constraint in CONSTRAINT_ERRORS:
        return CONSTRAINT_ERRORS[constraint]
    sqlstate = getattr(orig, "sqlstate", None)
    if sqlstate is None or exc.connection_invalidated or sqlstate.startswith("08"):
        return _UNAVAILABLE
    return SQLSTATE_ERRORS.get(sqlstate)
