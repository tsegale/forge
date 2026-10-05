"""The fake gateway's payment simulator: pays orders through the real webhook path, and only
exists when the fake gateway is in use."""

import pytest
from flask import Flask
from sqlalchemy import select

from app.api import test_payments
from app.models import Order, Payment, PaymentEvent
from app.models.enums import OrderStatus, PaymentEventKind, PaymentStatus

RAM = "FRG-RAM-CR-VEN-32-6000"
ADDRESS = {"recipient_name": "Ada Lovelace", "line1": "12 Independence Avenue", "city": "Windhoek"}


@pytest.fixture()
def unpaid(client, make_user, auth_headers, product_by_sku, fake_gateway):
    headers = auth_headers(make_user())
    client.post("/api/v1/cart/items", json={"product_id": product_by_sku(RAM).id}, headers=headers)
    number = client.post("/api/v1/checkout", json={"address": ADDRESS}, headers=headers).get_json()["order_number"]
    return number, headers


def _simulate(client, number, headers, outcome):
    return client.post(f"/api/test/payments/{number}", json={"outcome": outcome}, headers=headers)


def test_a_simulated_payment_pays_the_order_through_the_webhook(client, session, unpaid):
    number, headers = unpaid
    response = _simulate(client, number, headers, "succeeded")

    assert response.status_code == 200 and response.get_json() == {"status": "succeeded"}
    order = session.scalar(select(Order).where(Order.order_number == number))
    session.refresh(order)
    assert order.status is OrderStatus.PAID
    kinds = session.scalars(select(PaymentEvent.kind).where(PaymentEvent.order_id == order.id)).all()
    assert PaymentEventKind.SUCCEEDED in kinds  # recorded exactly as a Stripe webhook would be


def test_a_decline_leaves_the_order_payable_with_another_card(client, session, unpaid):
    number, headers = unpaid
    declined = _simulate(client, number, headers, "declined").get_json()
    assert declined == {"status": "declined", "message": "Your card was declined."}

    order = session.scalar(select(Order).where(Order.order_number == number))
    session.refresh(order)
    assert order.status is OrderStatus.PENDING_PAYMENT
    payment = session.scalar(select(Payment).where(Payment.order_id == order.id))
    assert payment.status is PaymentStatus.FAILED

    assert _simulate(client, number, headers, "succeeded").status_code == 200
    session.refresh(order)
    assert order.status is OrderStatus.PAID


def test_only_the_owner_can_simulate_and_the_outcome_is_validated(client, unpaid, make_user, auth_headers):
    number, headers = unpaid
    assert _simulate(client, number, auth_headers(make_user()), "succeeded").status_code == 404
    assert _simulate(client, number, headers, "maybe").status_code == 422
    assert client.post(f"/api/test/payments/{number}", json={"outcome": "succeeded"}).status_code == 401


@pytest.mark.parametrize(("gateway", "mounted"), [("stripe", False), ("fake", True)])
def test_the_simulator_exists_only_with_the_fake_gateway(gateway, mounted):
    app = Flask("forge-check")
    app.config["PAYMENT_GATEWAY"] = gateway
    test_payments.init_app(app)
    assert any(rule.rule.startswith("/api/test/") for rule in app.url_map.iter_rules()) is mounted


def test_config_tells_the_client_which_payment_provider_is_live(client):
    assert client.get("/api/v1/config").get_json()["payment_provider"] == "fake"
