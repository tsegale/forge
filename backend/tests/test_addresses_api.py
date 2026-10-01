"""Address book: ownership, validation, and one default per type."""

import pytest
from sqlalchemy.exc import IntegrityError

from app.models import Address

ADDRESSES = "/api/v1/addresses"


def _address(**overrides):
    return {
        "type": "shipping",
        "recipient_name": "  Ada Lovelace ",
        "phone": "+264 61 123 4567",
        "line1": "12 Independence Avenue",
        "city": "Windhoek",
        "postal_code": "10005",
        "country_code": "na",
    } | overrides


@pytest.fixture()
def owner(make_user, auth_headers):
    return auth_headers(make_user())


def _create(client, headers, **overrides):
    response = client.post(ADDRESSES, json=_address(**overrides), headers=headers)
    assert response.status_code == 201, response.get_json()
    return response.get_json()


def test_create_normalises_and_defaults_country(client, owner):
    body = _create(client, owner, country_code="na")
    assert body["recipient_name"] == "Ada Lovelace" and body["country_code"] == "NA" and body["is_default"] is False


def test_requires_authentication(client):
    assert client.get(ADDRESSES).status_code == 401


@pytest.mark.parametrize(
    "bad",
    [{"country_code": "NAM"}, {"phone": "call me"}, {"line1": ""}, {"type": "postal"}, {"surprise": 1}],
    ids=["country", "phone", "empty-line1", "type", "unknown-field"],
)
def test_invalid_addresses_are_422(client, owner, bad):
    assert client.post(ADDRESSES, json=_address(**bad), headers=owner).status_code == 422


def test_other_users_addresses_are_404(client, owner, make_user, auth_headers):
    address = _create(client, owner)
    stranger = auth_headers(make_user())
    for method, kwargs in (("get", {}), ("patch", {"json": {"city": "Swakopmund"}}), ("delete", {})):
        assert getattr(client, method)(f"{ADDRESSES}/{address['id']}", headers=stranger, **kwargs).status_code == 404


def test_new_default_replaces_the_old_one_per_type(client, owner):
    first = _create(client, owner, is_default=True)
    billing = _create(client, owner, type="billing", is_default=True)
    second = _create(client, owner, is_default=True)
    defaults = {a["id"]: a["is_default"] for a in client.get(ADDRESSES, headers=owner).get_json()["items"]}
    assert defaults == {first["id"]: False, second["id"]: True, billing["id"]: True}


def test_promoting_via_patch_demotes_the_previous_default(client, owner):
    first = _create(client, owner, is_default=True)
    second = _create(client, owner)
    client.patch(f"{ADDRESSES}/{second['id']}", json={"is_default": True}, headers=owner)
    assert client.get(f"{ADDRESSES}/{first['id']}", headers=owner).get_json()["is_default"] is False


def test_concurrent_defaults_are_caught_by_the_database(client, session, owner):
    """The service demotes under a lock; the partial unique index is the backstop, mapped to 409."""
    user_id = session.get(Address, _create(client, owner, is_default=True)["id"]).user_id
    session.add(
        Address(user_id=user_id, **(_address(recipient_name="Racer") | {"country_code": "NA"}), is_default=True)
    )
    with pytest.raises(IntegrityError) as exc, session.begin_nested():
        session.flush()
    assert exc.value.orig.diag.constraint_name == "uq_addresses_one_default_per_type"


def test_required_fields_cannot_be_cleared(client, owner):
    address = _create(client, owner)
    response = client.patch(f"{ADDRESSES}/{address['id']}", json={"city": None}, headers=owner)
    assert response.status_code == 422


def test_update_and_delete(client, owner):
    address = _create(client, owner)
    assert (
        client.patch(f"{ADDRESSES}/{address['id']}", json={"city": "Swakopmund"}, headers=owner).get_json()["city"]
        == "Swakopmund"
    )
    assert client.delete(f"{ADDRESSES}/{address['id']}", headers=owner).status_code == 204
    assert client.get(f"{ADDRESSES}/{address['id']}", headers=owner).status_code == 404
