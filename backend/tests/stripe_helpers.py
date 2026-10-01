"""Build webhook deliveries exactly as Stripe signs them, so tests exercise real verification.

Stripe sends ``Stripe-Signature: t=<unix time>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>``.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
import uuid
from typing import Any

from app.config import TEST_WEBHOOK_SECRET


def sign(payload: bytes, secret: str = TEST_WEBHOOK_SECRET, timestamp: int | None = None) -> str:
    t = int(time.time()) if timestamp is None else timestamp
    digest = hmac.new(secret.encode(), f"{t}.".encode() + payload, hashlib.sha256).hexdigest()
    return f"t={t},v1={digest}"


def event(event_type: str, obj: dict[str, Any], event_id: str | None = None) -> bytes:
    body = {
        "id": event_id or f"evt_{uuid.uuid4().hex}",
        "object": "event",
        "type": event_type,
        "api_version": "2025-01-01",
        "created": int(time.time()),
        "livemode": False,
        "data": {"object": obj},
    }
    return json.dumps(body).encode()


def payment_intent(
    intent_id: str, amount: int, currency: str = "nad", status: str = "succeeded", **extra: Any
) -> dict[str, Any]:
    return {
        "id": intent_id,
        "object": "payment_intent",
        "amount": amount,
        "currency": currency,
        "status": status,
        **extra,
    }
