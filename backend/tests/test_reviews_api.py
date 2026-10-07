"""Reviews: one per customer per product, a database-set verified-purchase badge, keyset pages."""

import pytest
from sqlalchemy import select, update

from app.models import Order, Payment, Review
from app.models.enums import OrderStatus, UserRole
from tests.stripe_helpers import event, payment_intent, sign

RAM = "FRG-RAM-CR-VEN-32-6000"
ADDRESS = {"recipient_name": "Ada Lovelace", "line1": "12 Independence Avenue", "city": "Windhoek"}
BODY = "Runs at its rated speed with EXPO enabled, no issues."


def _url(product, suffix=""):
    return f"/api/v1/products/{product.slug}/reviews{suffix}"


@pytest.fixture()
def ram(product_by_sku):
    return product_by_sku(RAM)


@pytest.fixture()
def reviewer(make_user, auth_headers):
    user = make_user(email="reviewer@example.com")
    user.first_name, user.last_name = "Ada", "lovelace"
    return user, auth_headers(user)


def _buy(client, session, headers, product, *, pay=True) -> Order:
    """Checkout through the API; with ``pay``, the signed webhook marks the order paid."""
    client.post("/api/v1/cart/items", json={"product_id": product.id}, headers=headers)
    number = client.post("/api/v1/checkout", json={"address": ADDRESS}, headers=headers).get_json()["order_number"]
    order = session.scalar(select(Order).where(Order.order_number == number))
    if pay:
        intent = session.scalar(select(Payment.provider_payment_id).where(Payment.order_id == order.id))
        body = event("payment_intent.succeeded", payment_intent(intent, order.total_cents))
        assert (
            client.post("/api/v1/webhooks/stripe", data=body, headers={"Stripe-Signature": sign(body)}).status_code
            == 200
        )
        session.refresh(order)
        assert order.status is OrderStatus.PAID
    return order


def _review(client, headers, product, **overrides):
    return client.post(_url(product), json={"rating": 5, "body": BODY, **overrides}, headers=headers)


def test_a_review_without_a_purchase_is_unverified_and_shows_a_short_author(client, ram, reviewer):
    response = _review(client, reviewer[1], ram, title="  Fast kit  ")
    assert response.status_code == 201, response.get_json()
    body = response.get_json()
    assert body["is_verified_purchase"] is False
    assert body["author"] == "Ada L."
    assert body["title"] == "Fast kit"


def test_a_paid_purchase_makes_the_review_verified_whatever_the_client_sends(client, session, ram, reviewer):
    _buy(client, session, reviewer[1], ram)
    response = _review(client, reviewer[1], ram)
    assert response.get_json()["is_verified_purchase"] is True

    # The flag belongs to the database: forcing it from any code path is overwritten.
    review = session.get(Review, response.get_json()["id"])
    session.execute(update(Review).where(Review.id == review.id).values(is_verified_purchase=False))
    session.refresh(review)
    assert review.is_verified_purchase is True


def test_paying_later_verifies_an_earlier_review_and_cancelling_does_not(client, session, ram, reviewer, make_user):
    order = _buy(client, session, reviewer[1], ram, pay=False)
    review_id = _review(client, reviewer[1], ram).get_json()["id"]
    assert session.get(Review, review_id).is_verified_purchase is False

    intent = session.scalar(select(Payment.provider_payment_id).where(Payment.order_id == order.id))
    body = event("payment_intent.succeeded", payment_intent(intent, order.total_cents))
    client.post("/api/v1/webhooks/stripe", data=body, headers={"Stripe-Signature": sign(body)})
    review = session.get(Review, review_id)
    session.refresh(review)
    assert review.is_verified_purchase is True


def test_a_refund_removes_the_badge(client, session, ram, reviewer, make_user, auth_headers):
    order = _buy(client, session, reviewer[1], ram)
    review_id = _review(client, reviewer[1], ram).get_json()["id"]
    admin = auth_headers(make_user(role=UserRole.ADMIN))
    assert client.post(f"/api/v1/admin/orders/{order.order_number}/refund", json={}, headers=admin).status_code == 200
    review = session.get(Review, review_id)
    session.refresh(review)
    assert review.is_verified_purchase is False


def test_one_review_per_product_then_edit_it(client, ram, reviewer):
    assert _review(client, reviewer[1], ram).status_code == 201
    again = _review(client, reviewer[1], ram)
    assert again.status_code == 409 and again.get_json()["error"]["code"] == "review_exists"

    mine = client.get(_url(ram, "/mine"), headers=reviewer[1]).get_json()["review"]
    edited = client.patch(f"/api/v1/reviews/{mine['id']}", json={"rating": 3, "title": None}, headers=reviewer[1])
    assert edited.status_code == 200
    assert edited.get_json()["rating"] == 3 and edited.get_json()["title"] is None
    assert edited.get_json()["body"] == BODY


@pytest.mark.parametrize(
    "payload",
    [
        {"rating": 0, "body": BODY},
        {"rating": 6, "body": BODY},
        {"rating": 4.5, "body": BODY},
        {"rating": 4, "body": "  short  "},
    ],
)
def test_invalid_reviews_are_422(client, ram, reviewer, payload):
    assert client.post(_url(ram), json=payload, headers=reviewer[1]).status_code == 422


def test_the_database_refuses_a_short_body_from_any_code_path(session, ram, reviewer):
    session.add(Review(product_id=ram.id, user_id=reviewer[0].id, rating=4, body="   ok    "))
    with pytest.raises(Exception, match="ck_reviews_body_length"):
        session.flush()


def test_only_the_author_edits_and_admins_may_delete(client, ram, reviewer, make_user, auth_headers):
    review_id = _review(client, reviewer[1], ram).get_json()["id"]
    other = auth_headers(make_user())
    assert client.patch(f"/api/v1/reviews/{review_id}", json={"rating": 1}, headers=other).status_code == 403
    assert client.delete(f"/api/v1/reviews/{review_id}", headers=other).status_code == 403
    admin = auth_headers(make_user(role=UserRole.ADMIN))
    assert client.patch(f"/api/v1/reviews/{review_id}", json={"rating": 1}, headers=admin).status_code == 403
    assert client.delete(f"/api/v1/reviews/{review_id}", headers=admin).status_code == 204
    gone = client.get(_url(ram, "/mine"), headers=reviewer[1])
    assert gone.status_code == 200 and gone.get_json() == {"review": None}


def test_writing_requires_sign_in(client, ram):
    assert client.post(_url(ram), json={"rating": 5, "body": BODY}).status_code == 401


def test_listing_summarises_sorts_and_pages(client, session, ram, make_user, auth_headers):
    for rating in (5, 3, 4, 5, 1):
        assert _review(client, auth_headers(make_user()), ram, rating=rating).status_code == 201

    first = client.get(_url(ram, "?limit=2&sort=highest")).get_json()
    assert first["summary"] == {
        "average": 3.6,
        "count": 5,
        "counts": {"1": 1, "2": 0, "3": 1, "4": 1, "5": 2},
    }
    ratings = [r["rating"] for r in first["items"]]
    cursor = first["next_cursor"]
    while cursor:
        page = client.get(_url(ram, f"?limit=2&sort=highest&cursor={cursor}")).get_json()
        ratings += [r["rating"] for r in page["items"]]
        cursor = page["next_cursor"]
    assert ratings == [5, 5, 4, 3, 1]

    newest = client.get(_url(ram, "?limit=3")).get_json()
    second = client.get(_url(ram, f"?limit=3&cursor={newest['next_cursor']}")).get_json()
    ids = [r["id"] for r in newest["items"] + second["items"]]
    assert len(ids) == len(set(ids)) == 5

    detail = client.get(f"/api/v1/products/{ram.slug}").get_json()
    assert detail["rating"] == {"average": 3.6, "count": 5}


def test_verified_only_and_cursor_binding(client, session, ram, reviewer, make_user, auth_headers):
    _buy(client, session, reviewer[1], ram)
    _review(client, reviewer[1], ram)
    _review(client, auth_headers(make_user()), ram, rating=2)
    verified = client.get(_url(ram, "?verified_only=true")).get_json()
    assert [r["author"] for r in verified["items"]] == ["Ada L."]
    assert verified["summary"]["count"] == 2  # the summary covers every review

    page = client.get(_url(ram, "?limit=1")).get_json()
    reused = client.get(_url(ram, f"?limit=1&sort=lowest&cursor={page['next_cursor']}"))
    assert reused.status_code == 400 and reused.get_json()["error"]["code"] == "cursor_mismatch"


def test_reviews_of_an_unknown_product_are_404(client):
    assert client.get("/api/v1/products/no-such-part/reviews").status_code == 404
