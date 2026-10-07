"""Home collections from the database's own history: price drops, back in stock, featured builds;
and inventory_events, written by trigger whatever changes the stock."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select, text, update
from sqlalchemy.exc import DBAPIError, IntegrityError

from app.models import Build, BuildItem, Inventory, InventoryEvent, PriceHistory, Product
from app.models.enums import BuildStatus
from app.services.audit import set_actor

DROPS = "/api/v1/products/price-drops"
RESTOCKS = "/api/v1/products/back-in-stock"
FEATURED = "/api/v1/builds/featured"
GPU, CPU, CASE = "FRG-GPU-MSI-4070S-V2X", "FRG-CPU-R7-7800X3D", "FRG-CASE-FD-NORTH"


def _history(session, product, entries):
    session.execute(text("DELETE FROM price_history WHERE product_id = :id"), {"id": product.id})
    now = datetime.now(UTC)
    for days_ago, cents in entries:
        session.add(PriceHistory(product_id=product.id, price_cents=cents, recorded_at=now - timedelta(days=days_ago)))
    session.flush()


def _reset_all_history(session):
    session.execute(text("DELETE FROM price_history"))
    session.flush()


# --------------------------------------------------------------------- price drops


def test_a_recent_cut_that_still_holds_is_a_price_drop(client, session, product_by_sku):
    _reset_all_history(session)
    gpu = product_by_sku(GPU)
    _history(session, gpu, [(60, gpu.price_cents + 150_000), (3, gpu.price_cents)])
    [drop] = client.get(DROPS).get_json()["items"]
    assert drop["product"]["sku"] == GPU
    assert drop["was"]["amount_cents"] == gpu.price_cents + 150_000
    assert drop["saving_cents"] == 150_000
    assert drop["percent_off"] == 150_000 * 100 // (gpu.price_cents + 150_000)


def test_a_rise_is_not_a_drop(client, session, product_by_sku):
    _reset_all_history(session)
    gpu = product_by_sku(GPU)
    _history(session, gpu, [(60, gpu.price_cents - 100_000), (3, gpu.price_cents)])
    assert client.get(DROPS).get_json()["items"] == []


def test_a_cut_outside_the_window_is_not_shown(client, session, product_by_sku):
    _reset_all_history(session)
    gpu = product_by_sku(GPU)
    _history(session, gpu, [(90, gpu.price_cents + 100_000), (45, gpu.price_cents)])
    assert client.get(DROPS).get_json()["items"] == []  # 30 days by default
    assert len(client.get(f"{DROPS}?days=60").get_json()["items"]) == 1


def test_a_drop_that_was_reversed_is_not_shown(client, session, product_by_sku):
    _reset_all_history(session)
    gpu = product_by_sku(GPU)
    _history(session, gpu, [(20, gpu.price_cents + 100_000), (5, gpu.price_cents)])
    session.execute(update(Product).where(Product.id == gpu.id).values(price_cents=gpu.price_cents + 100_000))
    assert client.get(DROPS).get_json()["items"] == []  # the trigger logged the rise back


def test_biggest_percentage_first_and_limited(client, session, product_by_sku):
    _reset_all_history(session)
    gpu, cpu = product_by_sku(GPU), product_by_sku(CPU)
    _history(session, gpu, [(30, gpu.price_cents + 50_000), (2, gpu.price_cents)])
    _history(session, cpu, [(30, cpu.price_cents * 2), (2, cpu.price_cents)])  # 50% off
    body = client.get(f"{DROPS}?limit=1").get_json()
    assert [d["product"]["sku"] for d in body["items"]] == [CPU]


# --------------------------------------------------------------------- inventory events and restocks


def test_every_stock_change_is_recorded_with_its_actor(session, product_by_sku, make_user):
    admin = make_user()
    gpu = product_by_sku(GPU)
    before = session.get(Inventory, gpu.id).quantity_on_hand
    set_actor(session, admin.id)
    session.execute(update(Inventory).where(Inventory.product_id == gpu.id).values(quantity_on_hand=before + 5))
    event = session.scalars(
        select(InventoryEvent).where(InventoryEvent.product_id == gpu.id).order_by(InventoryEvent.id.desc())
    ).first()
    assert (event.on_hand_before, event.on_hand_after, event.actor_id) == (before, before + 5, admin.id)


def test_a_no_op_update_writes_nothing(session, product_by_sku):
    gpu = product_by_sku(GPU)
    count = lambda: len(session.scalars(select(InventoryEvent).where(InventoryEvent.product_id == gpu.id)).all())  # noqa: E731
    start = count()
    session.execute(update(Inventory).where(Inventory.product_id == gpu.id).values(version=Inventory.version + 1))
    assert count() == start


def test_inventory_events_are_append_only(session, product_by_sku):
    event = session.scalars(select(InventoryEvent)).first()
    with pytest.raises(DBAPIError):
        session.execute(
            update(InventoryEvent)
            .where(InventoryEvent.id == event.id)
            .values(on_hand_after=InventoryEvent.on_hand_after + 1)
        )


def test_deleting_a_user_keeps_their_events_without_the_name(session, product_by_sku, make_user):
    clerk = make_user()
    gpu = product_by_sku(GPU)
    set_actor(session, clerk.id)
    session.execute(update(Inventory).where(Inventory.product_id == gpu.id).values(quantity_on_hand=1))
    event_id = session.scalar(select(InventoryEvent.id).where(InventoryEvent.actor_id == clerk.id))
    session.delete(clerk)
    session.flush()
    event = session.get(InventoryEvent, event_id)
    session.refresh(event)
    assert event.actor_id is None and event.on_hand_after == 1


def test_a_product_that_comes_back_is_back_in_stock(client, session, product_by_sku):
    case = product_by_sku(CASE)
    on_hand = session.get(Inventory, case.id).quantity_on_hand
    session.execute(update(Inventory).where(Inventory.product_id == case.id).values(quantity_on_hand=0))
    assert CASE not in [i["product"]["sku"] for i in client.get(RESTOCKS).get_json()["items"]]
    session.execute(update(Inventory).where(Inventory.product_id == case.id).values(quantity_on_hand=on_hand))
    items = client.get(RESTOCKS).get_json()["items"]
    assert items[0]["product"]["sku"] == CASE


# --------------------------------------------------------------------- featured builds


def _build(session, owner, skus, **flags):
    build = Build(user_id=owner.id, name="Store pick", **flags)
    for sku in skus:
        build.items.append(BuildItem.for_product(session.scalar(select(Product).where(Product.sku == sku))))
    session.add(build)
    session.flush()
    return build


def test_featured_lists_only_validated_public_featured_builds(client, session, make_user):
    owner = make_user()
    shown = _build(session, owner, [CPU], is_public=True, share_slug="pick-1", is_featured=True, featured_blurb="Fast")
    shown.status = BuildStatus.VALIDATED
    _build(session, owner, [CPU], is_public=True, share_slug="pick-2", is_featured=True)  # still a draft
    _build(session, owner, [CPU], is_public=True, share_slug="pick-3")  # not featured
    session.flush()
    items = client.get(FEATURED).get_json()["items"]
    assert [b["share_slug"] for b in items] == ["pick-1"]
    assert items[0]["blurb"] == "Fast" and items[0]["items"][0]["product"]["sku"] == CPU


def test_an_edit_takes_a_build_off_the_home_page(client, session, make_user, product_by_sku):
    owner = make_user()
    build = _build(session, owner, [CPU], is_public=True, share_slug="pick-x", is_featured=True)
    build.status = BuildStatus.VALIDATED
    session.flush()
    session.execute(
        text("INSERT INTO build_items (build_id, product_id, kind_code, quantity) VALUES (:b, :p, 'gpu', 1)"),
        {"b": build.id, "p": product_by_sku(GPU).id},
    )
    session.refresh(build)
    assert build.status is BuildStatus.DRAFT  # guard_build_items resets it
    assert client.get(FEATURED).get_json()["items"] == []


def test_the_database_refuses_a_featured_build_that_is_not_public(session, make_user):
    session.add(Build(user_id=make_user().id, name="Secret", is_featured=True))
    with pytest.raises(IntegrityError, match="ck_builds_featured_requires_public"):
        session.flush()


def test_featured_is_public(client):
    assert client.get(FEATURED).status_code == 200
