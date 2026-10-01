"""Checkout: turn the cart or a validated build into an order with reserved stock."""

from __future__ import annotations

from flask import request

from ...schemas.orders import CheckoutRequest, CheckoutResponse
from ...security.guards import current_user, require_auth
from ...services import checkout as checkout_service
from ...services.orders import to_response
from ..spec import api, responses
from . import bp

TAG = "Checkout"


@bp.post("/checkout")
@require_auth
@api.validate(
    json=CheckoutRequest,
    resp=responses(401, 404, 409, 422, HTTP_201=CheckoutResponse),
    tags=[TAG],
    security={"bearerAuth": []},
)
def checkout():
    """Reserve stock and create a pending_payment order from the cart or a validated build.

    409 insufficient_stock lists each short line; 409 build_not_validated if the build is not both
    compatible and complete. Unpaid orders release their stock at reservation_expires_at."""
    order = checkout_service.place_order(current_user(), request.context.json)
    return CheckoutResponse(**to_response(order).model_dump()), 201
