"""Checkout: turn the cart or a validated build into an order with reserved stock."""

from __future__ import annotations

from flask import request

from ...errors import APIError
from ...schemas.orders import CheckoutRequest, CheckoutResponse, PaymentInfo
from ...security.guards import current_user, require_auth
from ...services import checkout as checkout_service
from ...services import payments as payment_service
from ...services.orders import to_response
from ..spec import api, responses
from . import bp

TAG = "Checkout"


class ServiceUnavailable(APIError):
    status, code, message = 503, "payment_unavailable", "Payments are temporarily unavailable. Try again shortly."


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
    order = checkout_service.place_order(current_user(), request.context.json)  # commits
    payment = payment_service.start_payment(order)  # only now, with no transaction open
    return CheckoutResponse(**to_response(order).model_dump(), payment=payment), 201


@bp.post("/orders/<string:order_number>/payment")
@require_auth
@api.validate(resp=responses(401, 404, 409, 503, HTTP_200=PaymentInfo), tags=[TAG], security={"bearerAuth": []})
def retry_payment(order_number: str):
    """Start (or resume) payment for an unpaid order. Safe to repeat: the same PaymentIntent is
    returned each time. 503 if the payment provider is unavailable; try again shortly."""
    payment = payment_service.start_payment(checkout_service.get_order(current_user(), order_number))
    if payment is None:
        raise ServiceUnavailable()
    return payment
