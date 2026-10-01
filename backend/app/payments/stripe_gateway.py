"""Stripe implementation of the payment gateway."""

from __future__ import annotations

from collections.abc import Mapping

import stripe

from .gateway import Intent, PaymentGatewayError, Refund, WebhookEvent, verify_webhook

RETRYABLE = (stripe.APIConnectionError, stripe.RateLimitError, stripe.APIError)


def _wrap(exc: stripe.StripeError) -> PaymentGatewayError:
    # Stripe's own messages never contain the full secret key, and we add none of ours.
    return PaymentGatewayError(
        f"{type(exc).__name__}: {exc.user_message or exc.code or 'request failed'}",
        retryable=isinstance(exc, RETRYABLE),
    )


class StripeGateway:
    def __init__(self, secret_key: str, webhook_secret: str, *, max_network_retries: int = 2) -> None:
        self._client = stripe.StripeClient(secret_key, max_network_retries=max_network_retries)
        self._webhook_secret = webhook_secret

    def __repr__(self) -> str:  # never print the keys
        return "StripeGateway()"

    def create_intent(
        self, *, amount_cents: int, currency: str, idempotency_key: str, metadata: Mapping[str, str]
    ) -> Intent:
        try:
            intent = self._client.v1.payment_intents.create(
                params={
                    "amount": amount_cents,
                    "currency": currency.lower(),
                    "metadata": dict(metadata),
                    "automatic_payment_methods": {"enabled": True},
                },
                options={"idempotency_key": idempotency_key},
            )
        except stripe.StripeError as exc:
            raise _wrap(exc) from exc
        return Intent(
            id=intent.id,
            client_secret=intent.client_secret or "",
            status=intent.status,
            amount_cents=intent.amount,
            currency=intent.currency,
        )

    def cancel_intent(self, intent_id: str, *, idempotency_key: str) -> None:
        try:
            self._client.v1.payment_intents.cancel(intent_id, options={"idempotency_key": idempotency_key})
        except stripe.InvalidRequestError as exc:
            # Already succeeded or already cancelled: the webhook path decides what happens next.
            if exc.code == "payment_intent_unexpected_state":
                return
            raise _wrap(exc) from exc
        except stripe.StripeError as exc:
            raise _wrap(exc) from exc

    def refund(self, intent_id: str, *, amount_cents: int, idempotency_key: str, metadata: Mapping[str, str]) -> Refund:
        try:
            refund = self._client.v1.refunds.create(
                params={"payment_intent": intent_id, "amount": amount_cents, "metadata": dict(metadata)},
                options={"idempotency_key": idempotency_key},
            )
        except stripe.StripeError as exc:
            raise _wrap(exc) from exc
        return Refund(id=refund.id, status=refund.status or "pending", amount_cents=refund.amount)

    def parse_webhook(self, payload: bytes, signature: str | None) -> WebhookEvent:
        return verify_webhook(payload, signature, self._webhook_secret)
