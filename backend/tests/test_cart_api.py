"""Cart: guests by cookie, users by account, merged at login; live prices and VAT totals."""

import pytest
from sqlalchemy import func, select

from app.models import Cart
from app.services.pricing import compute
from tests.conftest import DEFAULT_PASSWORD

CART = "/api/v1/cart"
CPU, RAM = "FRG-CPU-R7-7800X3D", "FRG-RAM-CR-VEN-32-6000"


def _add(client, product, quantity=1, headers=None):
    return client.post(f"{CART}/items", json={"product_id": product.id, "quantity": quantity}, headers=headers or {})


def _cart_cookie(response):
    return next((h for h in response.headers.getlist("Set-Cookie") if h.startswith("forge_cart=")), None)


def _lines(body):
    return {i["product"]["sku"]: i["quantity"] for i in body["items"]}


# --------------------------------------------------------------------- guest carts


def test_empty_cart_creates_nothing(client, session):
    before = session.scalar(select(func.count()).select_from(Cart))
    response = client.get(CART)
    assert response.get_json()["items"] == [] and _cart_cookie(response) is None
    assert session.scalar(select(func.count()).select_from(Cart)) == before


def test_first_guest_write_sets_a_hardened_cookie(client, product_by_sku):
    response = _add(client, product_by_sku(CPU))
    cookie = _cart_cookie(response)
    assert response.status_code == 200
    for attribute in ("HttpOnly", "SameSite=Lax", "Path=/api/v1", "Max-Age="):
        assert attribute in cookie
    assert _lines(client.get(CART).get_json()) == {CPU: 1}  # the cookie identifies the cart


def test_adding_the_same_product_increases_its_line(client, product_by_sku):
    _add(client, product_by_sku(RAM), 2)
    assert _lines(_add(client, product_by_sku(RAM), 3).get_json()) == {RAM: 5}


def test_lines_are_capped_at_99_by_the_database(client, product_by_sku):
    _add(client, product_by_sku(RAM), 98)
    response = _add(client, product_by_sku(RAM), 2)
    assert response.status_code == 422
    assert response.get_json()["error"]["code"] == "cart_quantity_limit"


def test_unavailable_products_are_422(client, session, product_by_sku):
    product = product_by_sku(RAM)
    product.is_active = False
    session.flush()
    assert _add(client, product).status_code == 422


def test_totals_use_the_vat_inclusive_pricing(client, product_by_sku):
    cpu = product_by_sku(CPU)
    body = _add(client, cpu, 2).get_json()
    expected = compute(2 * cpu.price_cents, vat_rate_bps=1500, flat_cents=15_000, free_threshold_cents=500_000)
    totals = {k: v["amount_cents"] for k, v in body["totals"].items()}
    assert totals == {
        "subtotal": expected.subtotal_cents,
        "shipping": expected.shipping_cents,
        "tax": expected.tax_cents,
        "total": expected.total_cents,
    }
    assert totals["subtotal"] + totals["tax"] + totals["shipping"] == totals["total"]


def test_lines_beyond_available_stock_are_flagged(client, session, product_by_sku):
    cpu = product_by_sku(CPU)
    cpu.inventory.quantity_on_hand, cpu.inventory.quantity_reserved = 2, 0
    session.flush()
    assert _add(client, cpu, 3).get_json()["items"][0]["in_stock"] is False


def test_update_remove_and_clear(client, product_by_sku):
    line = _add(client, product_by_sku(CPU)).get_json()["items"][0]["id"]
    _add(client, product_by_sku(RAM))
    assert _lines(client.patch(f"{CART}/items/{line}", json={"quantity": 4}).get_json())[CPU] == 4
    assert CPU not in _lines(client.delete(f"{CART}/items/{line}").get_json())
    assert client.delete(CART).get_json()["items"] == []


def test_another_guests_lines_are_404(app, client, product_by_sku):
    line = _add(client, product_by_sku(CPU)).get_json()["items"][0]["id"]
    stranger = app.test_client()
    _add(stranger, product_by_sku(RAM))
    assert stranger.patch(f"{CART}/items/{line}", json={"quantity": 2}).status_code == 404
    assert stranger.delete(f"{CART}/items/{line}").status_code == 404


def test_garbled_cookie_is_just_an_empty_cart(client):
    client.set_cookie("forge_cart", "not-a-uuid", path="/api/v1")
    assert client.get(CART).get_json()["items"] == []


# --------------------------------------------------------------------- user carts and merging


def test_signed_in_users_get_their_own_cart(client, make_user, auth_headers, product_by_sku):
    headers = auth_headers(make_user())
    response = _add(client, product_by_sku(CPU), headers=headers)
    assert _cart_cookie(response) is None  # no guest cookie for a signed-in user
    assert _lines(client.get(CART, headers=headers).get_json()) == {CPU: 1}
    assert client.get(CART).get_json()["items"] == []  # the anonymous view is separate


def test_invalid_token_is_401_not_anonymous(client):
    assert client.get(CART, headers={"Authorization": "Bearer nonsense"}).status_code == 401


def test_login_merges_the_guest_cart(client, session, make_user, auth_headers, product_by_sku):
    user = make_user()
    headers = auth_headers(user)
    _add(client, product_by_sku(RAM), 98, headers=headers)  # the user's existing cart

    _add(client, product_by_sku(RAM), 5)  # as a guest, in the same browser
    _add(client, product_by_sku(CPU), 1)
    guest_carts = session.scalar(select(func.count()).select_from(Cart).where(Cart.guest_token.is_not(None)))

    login = client.post("/api/v1/auth/login", json={"email": user.email, "password": DEFAULT_PASSWORD})
    assert login.status_code == 200
    assert any(h.startswith("forge_cart=;") for h in login.headers.getlist("Set-Cookie"))

    assert _lines(client.get(CART, headers=headers).get_json()) == {RAM: 99, CPU: 1}  # 98 + 5, capped
    remaining = session.scalar(select(func.count()).select_from(Cart).where(Cart.guest_token.is_not(None)))
    assert remaining == guest_carts - 1


@pytest.mark.parametrize("quantity", [0, 100, 1.5, "3"])
def test_invalid_quantities_are_422(client, product_by_sku, quantity):
    assert (
        client.post(f"{CART}/items", json={"product_id": product_by_sku(CPU).id, "quantity": quantity}).status_code
        == 422
    )
