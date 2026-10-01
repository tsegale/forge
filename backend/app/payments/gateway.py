"""The payment gateway interface. Services depend on this, never on the Stripe SDK directly."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any, Protocol

import stripe


@dataclass(frozen=True, slots=True)
class Intent:
    id: str
    client_secret: str
    status: str
    amount_cents: int
    currency: str


@dataclass(frozen=True, slots=True)
class Refund:
    id: str
    status: str
    amount_cents: int


@dataclass(frozen=True, slots=True)
class WebhookEvent:
    id: str
    type: str
    object: Mapping[str, Any]
    raw: Mapping[str, Any] = field(repr=False)


class PaymentGatewayError(Exception):
    """A gateway call failed. ``retryable`` is True for network, rate-limit and server errors,
    where the same idempotency key can safely be retried."""

    def __init__(self, message: str, *, retryable: bool) -> None:
        super().__init__(message)
        self.retryable = retryable


class InvalidWebhook(Exception):
    """The webhook payload or its signature is invalid."""


class PaymentGateway(Protocol):
    def create_intent(
        self, *, amount_cents: int, currency: str, idempotency_key: str, metadata: Mapping[str, str]
    ) -> Intent: ...

    def cancel_intent(self, intent_id: str, *, idempotency_key: str) -> None: ...

    def refund(
        self, intent_id: str, *, amount_cents: int, idempotency_key: str, metadata: Mapping[str, str]
    ) -> Refund: ...

    def parse_webhook(self, payload: bytes, signature: str | None) -> WebhookEvent: ...


def verify_webhook(payload: bytes, signature: str | None, secret: str) -> WebhookEvent:
    """Verify a Stripe webhook signature (HMAC-SHA256 over ``t.payload``, with a timestamp
    tolerance against replays) and return the event. Shared by every gateway, so signature
    verification is never faked, not even in tests."""
    try:
        event = stripe.Webhook.construct_event(payload, signature, secret)
    except stripe.SignatureVerificationError as exc:
        raise InvalidWebhook("Invalid webhook signature.") from exc
    except ValueError as exc:
        raise InvalidWebhook("Invalid webhook payload.") from exc
    raw = event.to_dict()
    return WebhookEvent(id=raw["id"], type=raw["type"], object=raw["data"]["object"], raw=raw)
