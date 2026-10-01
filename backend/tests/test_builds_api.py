"""Build management: ownership, item changes, and the database rules surfacing as HTTP errors."""

import pytest

from app.models import Build
from app.models.enums import BuildStatus

BUILDS = "/api/v1/builds"
CPU = "FRG-CPU-R7-7800X3D"
OTHER_CPU = "FRG-CPU-R5-7600X"
RAM = "FRG-RAM-CR-VEN-32-6000"


@pytest.fixture()
def owner(make_user, auth_headers):
    user = make_user()
    return user, auth_headers(user)


@pytest.fixture()
def build(client, owner):
    response = client.post(BUILDS, json={"name": "  Gaming rig  "}, headers=owner[1])
    assert response.status_code == 201
    return response.get_json()


def _add(client, headers, build_id, product, quantity=1):
    return client.post(
        f"{BUILDS}/{build_id}/items", json={"product_id": product.id, "quantity": quantity}, headers=headers
    )


def _code(response):
    return response.get_json()["error"]["code"]


# --------------------------------------------------------------------- builds


def test_new_build_is_an_empty_draft(build):
    assert build["name"] == "Gaming rig"
    assert build["status"] == "draft"
    assert build["items"] == [] and build["item_count"] == 0
    assert build["subtotal"] == {"amount_cents": 0, "currency": "nad"}


def test_builds_require_authentication(client):
    assert client.get(BUILDS).status_code == 401
    assert client.post(BUILDS, json={"name": "x"}).status_code == 401


def test_list_shows_only_my_builds(client, owner, build, make_user, auth_headers):
    stranger = auth_headers(make_user())
    client.post(BUILDS, json={"name": "Theirs"}, headers=stranger)
    names = [b["name"] for b in client.get(BUILDS, headers=owner[1]).get_json()["items"]]
    assert names == ["Gaming rig"]


@pytest.mark.parametrize(
    ("method", "suffix", "body"),
    [
        ("get", "", None),
        ("patch", "", {"name": "Mine now"}),
        ("delete", "", None),
        ("post", "/items", {"product_id": 1}),
    ],
)
def test_other_users_builds_are_indistinguishable_from_missing(
    client, build, make_user, auth_headers, method, suffix, body
):
    stranger = auth_headers(make_user())
    response = getattr(client, method)(f"{BUILDS}/{build['id']}{suffix}", json=body, headers=stranger)
    assert response.status_code == 404


def test_rename_and_delete(client, owner, build):
    renamed = client.patch(f"{BUILDS}/{build['id']}", json={"name": "Workstation"}, headers=owner[1])
    assert renamed.get_json()["name"] == "Workstation"
    assert client.delete(f"{BUILDS}/{build['id']}", headers=owner[1]).status_code == 204
    assert client.get(f"{BUILDS}/{build['id']}", headers=owner[1]).status_code == 404


# --------------------------------------------------------------------- items


def test_adding_parts_updates_totals(client, owner, build, product_by_sku):
    cpu, ram = product_by_sku(CPU), product_by_sku(RAM)
    _add(client, owner[1], build["id"], cpu)
    response = _add(client, owner[1], build["id"], ram, quantity=2)
    assert response.status_code == 201
    body = response.get_json()
    assert body["item_count"] == 3
    assert body["subtotal"]["amount_cents"] == cpu.price_cents + 2 * ram.price_cents
    lines = {i["product"]["sku"]: i for i in body["items"]}
    assert lines[RAM]["line_total"]["amount_cents"] == 2 * ram.price_cents
    assert lines[CPU]["product"]["specs"]["kind"] == "cpu"


def test_change_quantity_and_remove(client, owner, build, product_by_sku):
    item_id = _add(client, owner[1], build["id"], product_by_sku(RAM)).get_json()["items"][0]["id"]
    changed = client.patch(f"{BUILDS}/{build['id']}/items/{item_id}", json={"quantity": 2}, headers=owner[1])
    assert changed.get_json()["items"][0]["quantity"] == 2
    removed = client.delete(f"{BUILDS}/{build['id']}/items/{item_id}", headers=owner[1])
    assert removed.status_code == 200 and removed.get_json()["items"] == []
    assert client.delete(f"{BUILDS}/{build['id']}/items/{item_id}", headers=owner[1]).status_code == 404


def test_second_cpu_is_409_from_the_slot_limit_trigger(client, owner, build, product_by_sku):
    _add(client, owner[1], build["id"], product_by_sku(CPU))
    response = _add(client, owner[1], build["id"], product_by_sku(OTHER_CPU))
    assert response.status_code == 409
    assert _code(response) == "build_slot_limit"


def test_same_product_twice_is_409(client, owner, build, product_by_sku):
    _add(client, owner[1], build["id"], product_by_sku(RAM))
    response = _add(client, owner[1], build["id"], product_by_sku(RAM))
    assert response.status_code == 409
    assert _code(response) == "duplicate_build_item"


def test_unknown_or_inactive_products_are_422(client, session, owner, build, product_by_sku):
    inactive = product_by_sku(RAM)
    inactive.is_active = False
    session.flush()
    for product_id in (inactive.id, 999_999):
        response = client.post(f"{BUILDS}/{build['id']}/items", json={"product_id": product_id}, headers=owner[1])
        assert response.status_code == 422
        assert response.get_json()["error"]["details"][0]["type"] == "product_unavailable"


def test_delisted_parts_stay_visible_in_saved_builds(client, session, owner, build, product_by_sku):
    ram = product_by_sku(RAM)
    _add(client, owner[1], build["id"], ram)
    ram.is_active = False
    session.flush()
    items = client.get(f"{BUILDS}/{build['id']}", headers=owner[1]).get_json()["items"]
    assert [i["product"]["sku"] for i in items] == [RAM]


@pytest.mark.parametrize("quantity", [0, 21, 1.5, "2"])
def test_invalid_quantities_are_422(client, owner, build, product_by_sku, quantity):
    body = {"product_id": product_by_sku(RAM).id, "quantity": quantity}
    assert client.post(f"{BUILDS}/{build['id']}/items", json=body, headers=owner[1]).status_code == 422


# --------------------------------------------------------------------- status rules from the database


def _set_status(session, build_id, status):
    """Commit, not flush: requests share this session, and an error response rolls it back, which
    would otherwise undo this setup too. The per-test transaction still discards it afterwards."""
    session.get(Build, build_id).status = status
    session.commit()


def test_changing_parts_returns_a_validated_build_to_draft(client, session, owner, build, product_by_sku):
    _set_status(session, build["id"], BuildStatus.VALIDATED)
    response = _add(client, owner[1], build["id"], product_by_sku(CPU))
    assert response.get_json()["status"] == "draft"


def test_ordered_builds_are_locked(client, session, owner, build, product_by_sku):
    _add(client, owner[1], build["id"], product_by_sku(CPU))
    _set_status(session, build["id"], BuildStatus.ORDERED)

    added = _add(client, owner[1], build["id"], product_by_sku(RAM))
    deleted = client.delete(f"{BUILDS}/{build['id']}", headers=owner[1])

    assert added.status_code == deleted.status_code == 409
    assert _code(added) == _code(deleted) == "build_locked"
    assert client.get(f"{BUILDS}/{build['id']}", headers=owner[1]).get_json()["status"] == "ordered"
