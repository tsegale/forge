"""Stripe-shaped payment events for the fake gateway (development and end-to-end tests).

With the fake gateway there is no Stripe to send webhooks, so a customer's payment is simulated
by building the event Stripe would send and signing it with the configured webhook secret. The
caller hands it to the normal webhook processing, signature check included, so the order is paid
by exactly the code path a real payment takes.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
import uuid
from typing import Any

DECLINE = {
    "code": "card_declined",
    "decline_code": "generic_decline",
    "message": "Your card was declined.",
}


def sign(payload: bytes, secret: str) -> str:
    """A Stripe-Signature header: HMAC-SHA256 over "<timestamp>.<payload>"."""
    timestamp = int(time.time())
    digest = hmac.new(secret.encode(), f"{timestamp}.".encode() + payload, hashlib.sha256).hexdigest()
    return f"t={timestamp},v1={digest}"


def intent_event(
    *, succeeded: bool, intent_id: str, amount_cents: int, currency: str, metadata: dict[str, str]
) -> bytes:
    """payment_intent.succeeded, or payment_intent.payment_failed with a card decline."""
    intent: dict[str, Any] = {
        "id": intent_id,
        "object": "payment_intent",
        "amount": amount_cents,
        "currency": currency.lower(),
        "status": "succeeded" if succeeded else "requires_payment_method",
        "metadata": metadata,
    }
    if not succeeded:
        intent["last_payment_error"] = DECLINE
    event = {
        "id": f"evt_sim_{uuid.uuid4().hex}",
        "object": "event",
        "type": "payment_intent.succeeded" if succeeded else "payment_intent.payment_failed",
        "api_version": "2025-01-01",
        "created": int(time.time()),
        "livemode": False,
        "data": {"object": intent},
    }
    return json.dumps(event).encode()
