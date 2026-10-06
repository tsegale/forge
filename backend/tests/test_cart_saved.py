"""Saved for later: kept in the cart, left out of totals, the item count and checkout."""

from tests.conftest import DEFAULT_PASSWORD

CART = "/api/v1/cart"
CPU, RAM, SSD = "FRG-CPU-R7-7800X3D", "FRG-RAM-CR-VEN-32-6000", "FRG-SSD-SAM-990PRO-2TB"
ADDRESS = {"recipient_name": "Ada Lovelace", "line1": "12 Independence Avenue", "city": "Windhoek"}


def _add(client, product, quantity=1, headers=None):
    body = {"product_id": product.id, "quantity": quantity}
    response = client.post(f"{CART}/items", json=body, headers=headers or {})
    assert response.status_code in (200, 201), response.get_json()
    return response.get_json()


def _line_id(body, sku, section="items"):
    return next(line["id"] for line in body[section] if line["product"]["sku"] == sku)


def _save(client, line_id, saved=True, headers=None):
    return client.patch(f"{CART}/items/{line_id}", json={"saved_for_later": saved}, headers=headers or {})


def _skus(body, section):
    return {line["product"]["sku"]: line["quantity"] for line in body[section]}


def test_saving_a_line_takes_it_out_of_the_totals_and_back(client, product_by_sku):
    _add(client, product_by_sku(CPU))
    body = _add(client, product_by_sku(RAM), 2)
    with_both = body["totals"]["total"]["amount_cents"]

    saved = _save(client, _line_id(body, RAM)).get_json()
    assert _skus(saved, "items") == {CPU: 1}
    assert _skus(saved, "saved") == {RAM: 2}  # the quantity is kept
    assert saved["item_count"] == 1
    assert saved["totals"]["total"]["amount_cents"] < with_both

    back = _save(client, _line_id(saved, RAM, "saved"), saved=False).get_json()
    assert _skus(back, "items") == {CPU: 1, RAM: 2} and back["saved"] == []
    assert back["totals"]["total"]["amount_cents"] == with_both


def test_adding_a_saved_product_moves_it_back_into_the_cart(client, product_by_sku):
    body = _add(client, product_by_sku(RAM))
    _save(client, _line_id(body, RAM))
    again = _add(client, product_by_sku(RAM))
    assert _skus(again, "items") == {RAM: 2} and again["saved"] == []


def test_clearing_the_cart_keeps_saved_lines(client, product_by_sku):
    _add(client, product_by_sku(CPU))
    body = _add(client, product_by_sku(RAM))
    _save(client, _line_id(body, RAM))
    cleared = client.delete(CART).get_json()
    assert cleared["items"] == [] and _skus(cleared, "saved") == {RAM: 1}


def test_checkout_buys_only_the_cart_and_keeps_saved_lines(client, make_user, auth_headers, product_by_sku):
    headers = auth_headers(make_user())
    _add(client, product_by_sku(CPU), headers=headers)
    body = _add(client, product_by_sku(SSD), headers=headers)
    _save(client, _line_id(body, SSD), headers=headers)

    order = client.post("/api/v1/checkout", json={"address": ADDRESS}, headers=headers)
    assert order.status_code == 201, order.get_json()
    assert [line["sku"] for line in order.get_json()["items"]] == [CPU]

    after = client.get(CART, headers=headers).get_json()
    assert after["items"] == [] and _skus(after, "saved") == {SSD: 1}


def test_a_cart_of_only_saved_lines_cannot_be_checked_out(client, make_user, auth_headers, product_by_sku):
    headers = auth_headers(make_user())
    body = _add(client, product_by_sku(CPU), headers=headers)
    _save(client, _line_id(body, CPU), headers=headers)
    response = client.post("/api/v1/checkout", json={"address": ADDRESS}, headers=headers)
    assert response.status_code == 422
    assert response.get_json()["error"]["details"][0]["type"] == "cart_empty"


def test_login_merge_keeps_a_line_saved_only_if_both_copies_were(client, make_user, auth_headers, product_by_sku):
    user = make_user()
    headers = auth_headers(user)
    mine = _add(client, product_by_sku(RAM), headers=headers)
    _save(client, _line_id(mine, RAM), headers=headers)  # saved in the account
    mine = _add(client, product_by_sku(SSD), headers=headers)
    _save(client, _line_id(mine, SSD), headers=headers)

    _add(client, product_by_sku(RAM))  # in the cart as a guest: wins
    guest = _add(client, product_by_sku(SSD))
    _save(client, _line_id(guest, SSD))  # saved as a guest too: stays saved

    login = client.post("/api/v1/auth/login", json={"email": user.email, "password": DEFAULT_PASSWORD})
    assert login.status_code == 200
    merged = client.get(CART, headers=headers).get_json()
    assert _skus(merged, "items") == {RAM: 2}
    assert _skus(merged, "saved") == {SSD: 2}


def test_an_update_must_change_something(client, product_by_sku):
    body = _add(client, product_by_sku(CPU))
    assert client.patch(f"{CART}/items/{_line_id(body, CPU)}", json={}).status_code == 422
