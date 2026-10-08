"""Inbound webhooks from the payment provider."""

from __future__ import annotations

from flask import request
from pydantic import BaseModel

from ...errors import BadRequest
from ...payments import InvalidWebhook
from ...services import webhooks as webhook_service
from ..spec import api, responses
from . import bp

TAG = "Webhooks"


class WebhookAck(BaseModel):
    """Acknowledgement for the provider; duplicate deliveries are acknowledged too."""

    received: bool
    duplicate: bool


@bp.post("/webhooks/stripe")
@api.validate(resp=responses(400, HTTP_200=WebhookAck), tags=[TAG])
def stripe_webhook():
    """Stripe event delivery. The Stripe-Signature header is verified against the raw body; each
    event is applied exactly once, however many times it is delivered."""
    try:
        outcome = webhook_service.process(request.get_data(), request.headers.get("Stripe-Signature"))
    except InvalidWebhook as exc:
        raise BadRequest(str(exc), code="invalid_webhook") from exc
    return WebhookAck(received=True, duplicate=outcome.duplicate)
