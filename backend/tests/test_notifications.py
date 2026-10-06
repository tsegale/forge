"""Order confirmation email (exactly once, queued after the payment commits) and partition upkeep."""

import smtplib
from datetime import date

import pytest
from sqlalchemy import select, text

from app.models import Order, Payment
from app.services import notifications
from app.services.mail import outbox
from app.services.maintenance import ensure_price_history_partitions
from app.services.notifications import format_money, send_order_confirmation
from app.tasks import maintain_price_history_partitions
from tests.stripe_helpers import event, payment_intent, sign

RAM = "FRG-RAM-CR-VEN-32-6000"
ADDRESS = {
    "recipient_name": "Ada Lovelace",
    "line1": "12 Independence Avenue",
    "city": "Windhoek",
    "postal_code": "10005",
}


@pytest.fixture(autouse=True)
def empty_outbox(app):
    with app.app_context():
        outbox().clear()


@pytest.fixture()
def order(client, session, make_user, auth_headers, product_by_sku):
    headers = auth_headers(make_user(email="ada@example.com"))
    client.post("/api/v1/cart/items", json={"product_id": product_by_sku(RAM).id}, headers=headers)
    number = client.post("/api/v1/checkout", json={"address": ADDRESS}, headers=headers).get_json()["order_number"]
    return session.scalar(select(Order).where(Order.order_number == number))


def _pay(client, session, order):
    intent = session.scalar(select(Payment.provider_payment_id).where(Payment.order_id == order.id))
    body = event("payment_intent.succeeded", payment_intent(intent, order.total_cents))
    assert (
        client.post("/api/v1/webhooks/stripe", data=body, headers={"Stripe-Signature": sign(body)}).status_code == 200
    )


def test_payment_sends_one_confirmation(client, session, order):
    assert outbox() == []  # nothing at checkout: only a confirmed payment triggers it
    _pay(client, session, order)

    [mail] = outbox()
    assert mail.to == "ada@example.com"
    assert mail.subject == f"Order {order.order_number} confirmed"
    assert format_money(order.total_cents, "NAD") in mail.text and format_money(order.total_cents, "NAD") in mail.html
    assert "Windhoek" in mail.text and "VAT (15%)" in mail.text
    assert chr(0x2014) not in mail.text + mail.html  # house style: no em dashes
    session.refresh(order)
    assert order.confirmation_sent_at is not None


def test_confirmation_is_never_sent_twice(client, session, order):
    _pay(client, session, order)
    assert send_order_confirmation(order.id) is False
    assert len(outbox()) == 1


def test_failed_send_releases_the_claim_for_the_retry(client, session, order, monkeypatch):
    def smtp_down(mail):
        raise smtplib.SMTPServerDisconnected("connection lost")

    monkeypatch.setattr(notifications, "send", smtp_down)
    with pytest.raises(smtplib.SMTPServerDisconnected):
        send_order_confirmation(order.id)
    session.refresh(order)
    assert order.confirmation_sent_at is None

    monkeypatch.undo()
    assert send_order_confirmation(order.id) is True
    assert len(outbox()) == 1


def test_customer_supplied_text_is_escaped_in_html(client, session, order):
    order.addresses[0].recipient_name = "<script>alert(1)</script>"
    session.commit()
    send_order_confirmation(order.id)
    assert "<script>" not in outbox()[0].html and "&lt;script&gt;" in outbox()[0].html


@pytest.mark.parametrize(
    ("cents", "currency", "expected"),
    [(0, "NAD", "N$ 0.00"), (5, "nad", "N$ 0.05"), (12_345_678, "NAD", "N$ 123,456.78"), (1999, "USD", "19.99 USD")],
)
def test_money_formatting(cents, currency, expected):
    assert format_money(cents, currency) == expected


# --------------------------------------------------------------------- partitions


def _partition_exists(session, name):
    return session.scalar(text("SELECT to_regclass(:n) IS NOT NULL"), {"n": name})


def test_partitions_are_created_ahead_and_idempotently(session):
    names = ensure_price_history_partitions(today=date(2031, 11, 15))
    assert names == ["price_history_y2031m11", "price_history_y2031m12", "price_history_y2032m01"]
    assert all(_partition_exists(session, n) for n in names)
    assert ensure_price_history_partitions(today=date(2031, 11, 15)) == names


def test_partition_task_covers_this_month_and_the_next_two(session):
    assert len(maintain_price_history_partitions.delay().get()) == 3
