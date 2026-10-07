"""Payment gateway: real webhook signature verification, the fake's idempotency, and key handling."""

import logging
import os
import time
import uuid

import pytest

from app.config import TEST_WEBHOOK_SECRET, DevelopmentConfig, ProductionConfig
from app.payments import FakeGateway, InvalidWebhook, StripeGateway, verify_webhook
from tests.stripe_helpers import event, payment_intent, sign


@pytest.fixture()
def body():
    return event("payment_intent.succeeded", payment_intent("pi_123", 10_000), event_id="evt_abc")


def test_valid_signature_yields_the_event(body):
    parsed = verify_webhook(body, sign(body), TEST_WEBHOOK_SECRET)
    assert (parsed.id, parsed.type, parsed.object["id"]) == ("evt_abc", "payment_intent.succeeded", "pi_123")


@pytest.mark.parametrize(
    "tamper",
    [
        pytest.param(lambda b: (b.replace(b"10000", b"1"), sign(b)), id="payload-altered-after-signing"),
        pytest.param(lambda b: (b, sign(b, secret="whsec_someone_else")), id="wrong-secret"),
        pytest.param(lambda b: (b, sign(b, timestamp=int(time.time()) - 3600)), id="replayed-an-hour-later"),
        pytest.param(lambda b: (b, None), id="missing-header"),
        pytest.param(lambda b: (b"not json", sign(b"not json")), id="malformed-payload"),
    ],
)
def test_invalid_deliveries_are_rejected(body, tamper):
    payload, signature = tamper(body)
    with pytest.raises(InvalidWebhook):
        verify_webhook(payload, signature, TEST_WEBHOOK_SECRET)


def test_fake_gateway_verifies_signatures_for_real(body):
    fake = FakeGateway(webhook_secret=TEST_WEBHOOK_SECRET)
    assert fake.parse_webhook(body, sign(body)).id == "evt_abc"
    with pytest.raises(InvalidWebhook):
        fake.parse_webhook(body, sign(body, secret="whsec_other"))


def test_fake_gateway_honours_idempotency_keys():
    fake = FakeGateway(webhook_secret=TEST_WEBHOOK_SECRET)
    a = fake.create_intent(amount_cents=500, currency="NAD", idempotency_key="k1", metadata={})
    b = fake.create_intent(amount_cents=500, currency="NAD", idempotency_key="k1", metadata={})
    c = fake.create_intent(amount_cents=500, currency="NAD", idempotency_key="k2", metadata={})
    assert a == b and a.id != c.id and a.currency == "nad"


# --------------------------------------------------------------------- configuration


@pytest.fixture()
def env(monkeypatch):
    for name in ("PAYMENT_GATEWAY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"):
        monkeypatch.delenv(name, raising=False)
    return monkeypatch


def test_without_keys_development_uses_the_fake_gateway(env):
    env.setenv("STRIPE_WEBHOOK_SECRET", "whsec_local")
    assert DevelopmentConfig().PAYMENT_GATEWAY == "fake"


@pytest.mark.parametrize("value", [None, "", "  "])
def test_fake_gateway_refuses_to_start_without_a_webhook_secret(env, value):
    # Compose passes an unset variable as "": the simulator used to fail every payment with a 500.
    if value is not None:
        env.setenv("STRIPE_WEBHOOK_SECRET", value)
    with pytest.raises(RuntimeError, match="Missing required environment variable: STRIPE_WEBHOOK_SECRET"):
        DevelopmentConfig()


def test_webhook_secret_must_be_a_signing_secret(env):
    env.setenv("STRIPE_WEBHOOK_SECRET", "not-a-secret")
    with pytest.raises(RuntimeError, match="whsec_"):
        DevelopmentConfig()


def test_test_key_selects_stripe_and_requires_a_webhook_secret(env):
    env.setenv("STRIPE_SECRET_KEY", "sk_test_abc")
    with pytest.raises(RuntimeError, match="STRIPE_WEBHOOK_SECRET"):
        DevelopmentConfig()
    env.setenv("STRIPE_WEBHOOK_SECRET", "whsec_abc")
    assert DevelopmentConfig().PAYMENT_GATEWAY == "stripe"


def test_live_key_is_refused_outside_production(env):
    env.setenv("STRIPE_SECRET_KEY", "sk_live_abc")
    env.setenv("STRIPE_WEBHOOK_SECRET", "whsec_abc")
    with pytest.raises(RuntimeError, match="live Stripe key"):
        DevelopmentConfig()


def test_production_requires_stripe(env):
    with pytest.raises(RuntimeError, match="STRIPE_SECRET_KEY"):
        ProductionConfig()
    env.setenv("PAYMENT_GATEWAY", "fake")
    with pytest.raises(RuntimeError, match="fake payment gateway"):
        ProductionConfig()


def test_keys_never_appear_in_reprs_or_logs(caplog):
    secret, hook = "sk_test_" + uuid.uuid4().hex, "whsec_" + uuid.uuid4().hex
    gateway = StripeGateway(secret, hook)
    with caplog.at_level(logging.DEBUG):
        logging.getLogger("forge").info("gateway ready: %r", gateway)
    assert secret not in repr(gateway) and hook not in repr(gateway)
    assert secret not in caplog.text and hook not in caplog.text


# --------------------------------------------------------------------- live test mode (opt-in)


@pytest.mark.skipif(
    not os.environ.get("STRIPE_SECRET_KEY", "").startswith("sk_test_"),
    reason="set a test-mode STRIPE_SECRET_KEY to run against Stripe",
)
def test_stripe_test_mode_accepts_nad_payment_intents():
    """Proves the store currency is chargeable: creates and immediately cancels a N$ 150.00 intent."""
    gateway = StripeGateway(os.environ["STRIPE_SECRET_KEY"], "whsec_unused")
    key = f"forge-test-{uuid.uuid4().hex}"
    intent = gateway.create_intent(
        amount_cents=15_000, currency="NAD", idempotency_key=key, metadata={"purpose": "test"}
    )
    assert intent.currency == "nad" and intent.amount_cents == 15_000 and intent.client_secret
    gateway.cancel_intent(intent.id, idempotency_key=f"{key}-cancel")
