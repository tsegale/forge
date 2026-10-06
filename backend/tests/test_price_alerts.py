"""Price-drop alerts: one per product, below today's price, one email when it fires."""

import pytest
from sqlalchemy import update

from app.models import PriceAlert, Product
from app.models.enums import UserRole
from app.services import price_alerts
from app.services.mail import outbox

ALERTS = "/api/v1/alerts"
GPU = "FRG-GPU-MSI-4070S-V2X"


@pytest.fixture(autouse=True)
def empty_outbox(app):
    with app.app_context():
        outbox().clear()


@pytest.fixture()
def shopper(make_user, auth_headers):
    user = make_user(email="watcher@example.com")
    return user, auth_headers(user)


def _set(client, headers, product, target):
    return client.post(ALERTS, json={"product_id": product.id, "target_price_cents": target}, headers=headers)


def _drop(session, product, cents):
    session.execute(update(Product).where(Product.id == product.id).values(price_cents=cents))
    session.flush()


def test_set_list_and_delete(client, shopper, product_by_sku):
    gpu = product_by_sku(GPU)
    created = _set(client, shopper[1], gpu, gpu.price_cents - 50_000)
    assert created.status_code == 200, created.get_json()
    body = created.get_json()
    assert body["target"]["amount_cents"] == gpu.price_cents - 50_000 and body["triggered_at"] is None
    assert [a["product"]["sku"] for a in client.get(ALERTS, headers=shopper[1]).get_json()["items"]] == [GPU]
    assert client.delete(f"{ALERTS}/{body['id']}", headers=shopper[1]).status_code == 204
    assert client.get(ALERTS, headers=shopper[1]).get_json()["items"] == []


def test_the_target_must_be_below_the_current_price(client, shopper, product_by_sku):
    gpu = product_by_sku(GPU)
    response = _set(client, shopper[1], gpu, gpu.price_cents)
    assert response.status_code == 422
    assert response.get_json()["error"]["details"][0]["type"] == "target_not_below_price"


def test_one_alert_per_product_and_setting_again_rearms_it(client, session, shopper, product_by_sku):
    gpu = product_by_sku(GPU)
    first = _set(client, shopper[1], gpu, gpu.price_cents - 10_000).get_json()
    session.execute(update(PriceAlert).where(PriceAlert.id == first["id"]).values(triggered_at=PriceAlert.created_at))
    again = _set(client, shopper[1], gpu, gpu.price_cents - 20_000).get_json()
    assert again["id"] == first["id"] and again["triggered_at"] is None
    assert again["target"]["amount_cents"] == gpu.price_cents - 20_000


def test_the_sweep_emails_once_when_the_price_reaches_the_target(client, session, shopper, product_by_sku):
    gpu = product_by_sku(GPU)
    target = gpu.price_cents - 50_000
    _set(client, shopper[1], gpu, target)
    assert price_alerts.sweep() == 0  # still above the target

    _drop(session, gpu, target)
    assert price_alerts.sweep() == 1
    [mail] = outbox()
    assert mail.to == "watcher@example.com" and gpu.name in mail.subject
    assert f"/products/{gpu.slug}" in mail.text
    assert price_alerts.sweep() == 0  # fires once


def test_an_admin_price_change_checks_that_products_alerts(
    client, session, shopper, product_by_sku, make_user, auth_headers
):
    gpu = product_by_sku(GPU)
    _set(client, shopper[1], gpu, gpu.price_cents - 50_000)
    session.commit()  # the admin request below must see the alert
    admin = auth_headers(make_user(role=UserRole.ADMIN))
    response = client.patch(
        f"/api/v1/admin/products/{gpu.id}", json={"price_cents": gpu.price_cents - 60_000}, headers=admin
    )
    assert response.status_code == 200, response.get_json()
    assert [m.to for m in outbox()] == ["watcher@example.com"]


def test_a_failed_send_releases_the_claim_for_the_retry(client, session, shopper, product_by_sku, monkeypatch):
    gpu = product_by_sku(GPU)
    target = gpu.price_cents - 50_000
    alert_id = _set(client, shopper[1], gpu, target).get_json()["id"]
    _drop(session, gpu, target - 1)

    def broken(mail):
        raise OSError("mail server down")

    monkeypatch.setattr(price_alerts, "send", broken)
    with pytest.raises(OSError):
        price_alerts.send_alert(alert_id)
    assert session.get(PriceAlert, alert_id).triggered_at is None
    monkeypatch.undo()
    assert price_alerts.send_alert(alert_id) is True


def test_alerts_belong_to_their_owner(client, shopper, product_by_sku, make_user, auth_headers):
    gpu = product_by_sku(GPU)
    alert_id = _set(client, shopper[1], gpu, gpu.price_cents - 10_000).get_json()["id"]
    stranger = auth_headers(make_user())
    assert client.delete(f"{ALERTS}/{alert_id}", headers=stranger).status_code == 404
    assert client.get(ALERTS, headers=stranger).get_json()["items"] == []
    assert client.get(ALERTS).status_code == 401
