"""Simulated card payments for the fake gateway, so the full checkout can run without Stripe
(local development without keys, and the end-to-end tests in CI).

Registered only when PAYMENT_GATEWAY is "fake", which the configuration refuses in production.
It lives outside /api/v1 because it is not part of the public API.
"""

from __future__ import annotations

from typing import Literal

from flask import Blueprint, Flask, current_app, request
from pydantic import BaseModel, ConfigDict, ValidationError
from sqlalchemy import select

from ..errors import Conflict, ValidationFailed
from ..extensions import db
from ..models import Payment
from ..models.enums import PaymentStatus
from ..payments import simulator
from ..security.guards import current_user, require_auth
from ..services import orders as order_service
from ..services import webhooks as webhook_service

bp = Blueprint("test_payments", __name__)


def init_app(app: Flask) -> None:
    """Mount the simulator only with the fake gateway (which production configuration refuses)."""
    if app.config["PAYMENT_GATEWAY"] == "fake":
        app.register_blueprint(bp, url_prefix="/api/test")


class SimulatedPayment(BaseModel):
    """Body of a simulated payment: whether the card succeeds or is declined."""

    model_config = ConfigDict(extra="forbid")

    outcome: Literal["succeeded", "declined"]


@bp.post("/payments/<string:order_number>")
@require_auth
def simulate(order_number: str):
    """Pay (or fail to pay) the caller's order as if Stripe had confirmed the card."""
    try:
        body = SimulatedPayment.model_validate(request.get_json(silent=True) or {})
    except ValidationError as exc:
        raise ValidationFailed("outcome must be 'succeeded' or 'declined'.") from exc

    order = order_service.get_owned(current_user(), order_number)
    payment = db.session.scalar(
        select(Payment)
        # A declined attempt leaves the intent open for another card, as with Stripe.
        .where(
            Payment.order_id == order.id,
            Payment.status.in_((PaymentStatus.REQUIRES_PAYMENT, PaymentStatus.FAILED)),
        )
        .order_by(Payment.id.desc())
    )
    if payment is None:
        raise Conflict("Start payment for this order first.", code="payment_not_started")

    succeeded = body.outcome == "succeeded"
    payload = simulator.intent_event(
        succeeded=succeeded,
        intent_id=payment.provider_payment_id,
        amount_cents=order.total_cents,
        currency=order.currency,
        metadata={"order_number": order.order_number, "order_id": str(order.id)},
    )
    db.session.commit()  # end the read transaction before processing, as a webhook request would
    webhook_service.process(payload, simulator.sign(payload, current_app.config["STRIPE_WEBHOOK_SECRET"]))
    if succeeded:
        return {"status": "succeeded"}
    return {"status": "declined", "message": simulator.DECLINE["message"]}
