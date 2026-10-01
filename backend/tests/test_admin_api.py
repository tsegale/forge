"""Administrator endpoints: role enforcement, product updates, and conditional stock edits."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select, update
from sqlalchemy.orm.exc import StaleDataError

from app.models import Inventory, Order, PriceHistory, StockReservation
from app.models.enums import ReservationStatus, UserRole

SKU = "FRG-CPU-R7-7800X3D"


@pytest.fixture()
def admin(make_user, auth_headers):
    return auth_headers(make_user(role=UserRole.ADMIN))


@pytest.fixture()
def product(product_by_sku):
    return product_by_sku(SKU)


def _product_url(product) -> str:
    return f"/api/v1/admin/products/{product.id}"


# --------------------------------------------------------------------- role enforcement


def test_admin_routes_require_authentication(client, product):
    assert client.patch(_product_url(product), json={"is_active": False}).status_code == 401


def test_customers_are_forbidden(client, product, make_user, auth_headers):
    response = client.patch(_product_url(product), json={"is_active": False}, headers=auth_headers(make_user()))
    assert response.status_code == 403
    assert response.get_json()["error"]["code"] == "forbidden"


def test_demoted_admin_loses_access_immediately(client, session, product, make_user, auth_headers):
    user = make_user(role=UserRole.ADMIN)
    headers = auth_headers(user)  # token still claims admin
    user.role = UserRole.CUSTOMER
    session.flush()
    assert client.patch(_product_url(product), json={"is_active": False}, headers=headers).status_code == 403


# --------------------------------------------------------------------- products


def test_price_change_is_recorded_in_price_history(client, session, admin, product):
    new_price = product.price_cents + 1_000
    before = session.scalar(select(func.count()).select_from(PriceHistory).where(PriceHistory.product_id == product.id))

    response = client.patch(_product_url(product), json={"price_cents": new_price}, headers=admin)

    assert response.status_code == 200
    assert response.get_json()["price_cents"] == new_price
    history = session.scalars(
        select(PriceHistory).where(PriceHistory.product_id == product.id).order_by(PriceHistory.id)
    ).all()
    assert len(history) == before + 1
    assert history[-1].price_cents == new_price


def test_deactivate_product(client, admin, product):
    response = client.patch(_product_url(product), json={"is_active": False}, headers=admin)
    assert response.status_code == 200
    assert response.get_json()["is_active"] is False


@pytest.mark.parametrize(
    "body",
    [{}, {"price_cents": -1}, {"price_cents": 10.0}, {"price_cents": "1000"}, {"price_cents": None}, {"name": "x"}],
    ids=["empty", "negative", "float", "string", "null", "unknown-field"],
)
def test_invalid_product_updates_are_422(client, admin, product, body):
    response = client.patch(_product_url(product), json=body, headers=admin)
    assert response.status_code == 422
    assert response.get_json()["error"]["code"] == "validation_failed"


def test_unknown_product_is_404(client, admin):
    assert client.patch("/api/v1/admin/products/999999", json={"is_active": False}, headers=admin).status_code == 404


# --------------------------------------------------------------------- inventory (conditional requests)


def _stock_url(product) -> str:
    return f"/api/v1/admin/inventory/{product.id}"


def _stock(client, product, headers) -> int:
    return client.get(_stock_url(product), headers=headers).get_json()["quantity_on_hand"]


def test_get_inventory_returns_version_as_etag(client, admin, product):
    response = client.get(_stock_url(product), headers=admin)
    assert response.status_code == 200
    body = response.get_json()
    assert response.headers["ETag"] == f'"{body["version"]}"'
    assert body["quantity_available"] == body["quantity_on_hand"] - body["quantity_reserved"]


def test_two_admins_editing_the_same_version_second_gets_412(app, session, product, make_user, auth_headers):
    alice, bob = (auth_headers(make_user(role=UserRole.ADMIN)) for _ in range(2))
    alice_client, bob_client = app.test_client(), app.test_client()

    etag_alice = alice_client.get(_stock_url(product), headers=alice).headers["ETag"]
    etag_bob = bob_client.get(_stock_url(product), headers=bob).headers["ETag"]
    assert etag_alice == etag_bob

    first = alice_client.patch(
        _stock_url(product), json={"quantity_on_hand": 40}, headers=alice | {"If-Match": etag_alice}
    )
    assert first.status_code == 200
    assert first.headers["ETag"] != etag_alice

    second = bob_client.patch(_stock_url(product), json={"quantity_on_hand": 99}, headers=bob | {"If-Match": etag_bob})
    assert second.status_code == 412
    assert second.get_json()["error"]["code"] == "precondition_failed"
    assert second.headers["ETag"] == first.headers["ETag"]  # Bob can re-read and retry

    assert _stock(alice_client, product, alice) == 40  # Bob's write was not applied


def test_missing_if_match_is_428(client, admin, product):
    response = client.patch(_stock_url(product), json={"quantity_on_hand": 5}, headers=admin)
    assert response.status_code == 428
    assert response.get_json()["error"]["code"] == "precondition_required"


def test_weak_etag_never_matches(client, admin, product):
    etag = client.get(_stock_url(product), headers=admin).headers["ETag"]
    response = client.patch(
        _stock_url(product), json={"quantity_on_hand": 5}, headers=admin | {"If-Match": f"W/{etag}"}
    )
    assert response.status_code == 412


def test_wildcard_if_match_updates_existing_row(client, admin, product):
    response = client.patch(_stock_url(product), json={"quantity_on_hand": 5}, headers=admin | {"If-Match": "*"})
    assert response.status_code == 200


def test_stock_below_reserved_is_409_from_database_constraint(client, session, admin, product):
    product.inventory.quantity_on_hand = 10
    product.inventory.quantity_reserved = 3
    session.flush()
    etag = client.get(_stock_url(product), headers=admin).headers["ETag"]
    response = client.patch(_stock_url(product), json={"quantity_on_hand": 2}, headers=admin | {"If-Match": etag})
    assert response.status_code == 409
    assert response.get_json()["error"]["code"] == "stock_below_reserved"


def test_reserved_stock_is_not_editable(client, admin, product):
    etag = client.get(_stock_url(product), headers=admin).headers["ETag"]
    body = {"quantity_on_hand": 5, "quantity_reserved": 0}
    assert client.patch(_stock_url(product), json=body, headers=admin | {"If-Match": etag}).status_code == 422


def test_orm_version_check_backstops_a_concurrent_write(session, product):
    """Between the If-Match check and the commit, a concurrent writer is caught by version_id_col."""
    inventory = product.inventory
    session.execute(
        update(Inventory).where(Inventory.product_id == product.id).values(version=Inventory.version + 1),
        execution_options={"synchronize_session": False},
    )
    inventory.quantity_on_hand += 1
    with pytest.raises(StaleDataError):
        session.flush()


def test_a_sale_invalidates_an_admins_etag(client, session, admin, product, make_user):
    """Reservations change stock through a database trigger that also bumps the version, so an
    admin edit based on a read from before the sale cannot overwrite the sale's decrement."""
    stale = client.get(_stock_url(product), headers=admin).headers["ETag"]

    order = Order(user_id=make_user().id, currency="nad", subtotal_cents=100, total_cents=100)
    session.add(order)
    session.flush()
    reservation = StockReservation(
        order_id=order.id, product_id=product.id, quantity=1, expires_at=datetime.now(UTC) + timedelta(minutes=15)
    )
    session.add(reservation)
    session.flush()
    reservation.status = ReservationStatus.COMMITTED  # the sale
    session.commit()

    response = client.patch(_stock_url(product), json={"quantity_on_hand": 99}, headers=admin | {"If-Match": stale})
    assert response.status_code == 412
