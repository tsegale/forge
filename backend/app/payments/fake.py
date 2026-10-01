"""In-process gateway for tests and for running without Stripe keys. It records every call and
honours idempotency keys like Stripe does, but webhooks still go through real signature checks."""

from __future__ import annotations

import uuid
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from typing import Any

from .gateway import Intent, PaymentGatewayError, Refund, WebhookEvent, verify_webhook


@dataclass
class FakeGateway:
    webhook_secret: str
    calls: list[tuple[str, dict[str, Any]]] = field(default_factory=list)
    intents: dict[str, Intent] = field(default_factory=dict)
    _by_key: dict[str, Any] = field(default_factory=dict)
    # Set to make the next call raise, e.g. PaymentGatewayError("down", retryable=True).
    fail_next: PaymentGatewayError | None = None
    # Called at the start of every gateway call; tests use it to observe the caller's state.
    on_call: Callable[[str], None] | None = None

    def _enter(self, name: str, **kwargs: Any) -> None:
        self.calls.append((name, kwargs))
        if self.on_call:
            self.on_call(name)
        if self.fail_next is not None:
            error, self.fail_next = self.fail_next, None
            raise error

    def create_intent(
        self, *, amount_cents: int, currency: str, idempotency_key: str, metadata: Mapping[str, str]
    ) -> Intent:
        self._enter("create_intent", amount_cents=amount_cents, currency=currency, idempotency_key=idempotency_key)
        if idempotency_key in self._by_key:
            return self._by_key[idempotency_key]
        token = uuid.uuid4().hex
        intent = Intent(
            f"pi_{token}", f"pi_{token}_secret_fake", "requires_payment_method", amount_cents, currency.lower()
        )
        self.intents[intent.id] = self._by_key[idempotency_key] = intent
        return intent

    def cancel_intent(self, intent_id: str, *, idempotency_key: str) -> None:
        self._enter("cancel_intent", intent_id=intent_id, idempotency_key=idempotency_key)

    def refund(self, intent_id: str, *, amount_cents: int, idempotency_key: str, metadata: Mapping[str, str]) -> Refund:
        self._enter("refund", intent_id=intent_id, amount_cents=amount_cents, idempotency_key=idempotency_key)
        if idempotency_key not in self._by_key:
            self._by_key[idempotency_key] = Refund(f"re_{uuid.uuid4().hex}", "succeeded", amount_cents)
        return self._by_key[idempotency_key]

    def parse_webhook(self, payload: bytes, signature: str | None) -> WebhookEvent:
        return verify_webhook(payload, signature, self.webhook_secret)

    def names(self) -> list[str]:
        return [name for name, _ in self.calls]
