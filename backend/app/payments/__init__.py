"""Payment gateway access. ``gateway()`` returns the app's configured implementation."""

from __future__ import annotations

from flask import Flask, current_app

from .fake import FakeGateway
from .gateway import (
    Intent,
    InvalidWebhook,
    PaymentGateway,
    PaymentGatewayError,
    Refund,
    WebhookEvent,
    verify_webhook,
)
from .stripe_gateway import StripeGateway

EXTENSION_KEY = "forge.payment_gateway"


def init_app(app: Flask) -> None:
    cfg = app.config
    if cfg["PAYMENT_GATEWAY"] == "stripe":
        app.extensions[EXTENSION_KEY] = StripeGateway(cfg["STRIPE_SECRET_KEY"], cfg["STRIPE_WEBHOOK_SECRET"])
    else:
        app.extensions[EXTENSION_KEY] = FakeGateway(webhook_secret=cfg["STRIPE_WEBHOOK_SECRET"])


def gateway() -> PaymentGateway:
    return current_app.extensions[EXTENSION_KEY]


__all__ = [
    "FakeGateway",
    "Intent",
    "InvalidWebhook",
    "PaymentGateway",
    "PaymentGatewayError",
    "Refund",
    "StripeGateway",
    "WebhookEvent",
    "gateway",
    "init_app",
    "verify_webhook",
]
