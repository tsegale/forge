"""Product detail additions: photos (with safe storage keys) and the price-history step series."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text, update
from sqlalchemy.exc import IntegrityError

from app.models import PriceHistory, Product, ProductImage

PRODUCTS = "/api/v1/products"


def _photo(product, position, key, **extra):
    return ProductImage(
        product_id=product.id,
        position=position,
        storage_key=key,
        alt_text=f"{product.name}, view {position}",
        width=1280,
        height=960,
        **extra,
    )


def test_detail_lists_photos_in_order_and_cards_show_the_first(client, session, product_by_sku):
    gpu = product_by_sku("FRG-GPU-MSI-4070S-V2X")
    session.add_all([_photo(gpu, 1, "FRG-GPU-MSI-4070S-V2X-2"), _photo(gpu, 0, "FRG-GPU-MSI-4070S-V2X-1")])
    session.flush()
    session.expire(gpu)

    detail = client.get(f"{PRODUCTS}/{gpu.slug}").get_json()
    assert [i["full"] for i in detail["images"]] == [
        "/media/products/FRG-GPU-MSI-4070S-V2X-1-full.webp",
        "/media/products/FRG-GPU-MSI-4070S-V2X-2-full.webp",
    ]
    assert detail["images"][0] == {
        "thumb": "/media/products/FRG-GPU-MSI-4070S-V2X-1-thumb.webp",
        "card": "/media/products/FRG-GPU-MSI-4070S-V2X-1-card.webp",
        "full": "/media/products/FRG-GPU-MSI-4070S-V2X-1-full.webp",
        "alt": f"{gpu.name}, view 0",
        "width": 1280,
        "height": 960,
    }
    listed = {i["id"]: i for i in client.get(f"{PRODUCTS}?kind=gpu&limit=100").get_json()["items"]}
    assert listed[gpu.id]["image"] == detail["images"][0]
    assert all(i["image"] is None for pid, i in listed.items() if pid != gpu.id)


def test_detail_without_photos_or_reviews(client, product_by_sku):
    body = client.get(f"{PRODUCTS}/{product_by_sku('FRG-CPU-R7-7800X3D').slug}").get_json()
    assert body["images"] == [] and body["image"] is None
    assert body["rating"] == {"average": None, "count": 0}


@pytest.mark.parametrize("key", ["../etc/passwd", "a/b", "-leading-dash", "with space", ".hidden"])
def test_storage_keys_are_file_names_never_paths(session, product_by_sku, key):
    session.add(_photo(product_by_sku("FRG-CPU-R7-7800X3D"), 0, key))
    with pytest.raises(IntegrityError, match="ck_product_images_storage_key_safe"):
        session.flush()


def test_one_photo_per_position(session, product_by_sku):
    cpu = product_by_sku("FRG-CPU-R7-7800X3D")
    session.add_all([_photo(cpu, 0, "a-1"), _photo(cpu, 0, "a-2")])
    with pytest.raises(IntegrityError, match="uq_product_images_product_position"):
        session.flush()


def _backdate(session, product, entries):
    """Replace the product's history with (days ago, price) rows."""
    session.execute(text("DELETE FROM price_history WHERE product_id = :id"), {"id": product.id})
    now = datetime.now(UTC)
    for days_ago, cents in entries:
        session.add(PriceHistory(product_id=product.id, price_cents=cents, recorded_at=now - timedelta(days=days_ago)))
    session.flush()


def test_price_history_is_a_step_series_opening_at_the_window_start(client, session, product_by_sku):
    cpu = product_by_sku("FRG-CPU-R7-7800X3D")
    _backdate(session, cpu, [(200, 900_000), (60, 850_000), (10, 820_000)])
    session.execute(update(Product).where(Product.id == cpu.id).values(price_cents=799_900))  # trigger logs it

    body = client.get(f"{PRODUCTS}/{cpu.slug}/price-history?days=90").get_json()
    prices = [p["price_cents"] for p in body["points"]]
    assert prices == [900_000, 850_000, 820_000, 799_900]  # opening price, then each change
    opened = datetime.fromisoformat(body["points"][0]["at"])
    assert abs((datetime.now(UTC) - opened) - timedelta(days=90)) < timedelta(minutes=1)
    assert body["current_cents"] == 799_900
    assert (body["lowest_cents"], body["highest_cents"]) == (799_900, 900_000)
    assert body["change_cents"] == 799_900 - 900_000
    assert body["currency"] == "nad" and body["days"] == 90


def test_price_history_without_earlier_rows_starts_at_the_first_change(client, session, product_by_sku):
    psu = product_by_sku("FRG-PSU-CR-RM850E")
    _backdate(session, psu, [(30, psu.price_cents)])
    body = client.get(f"{PRODUCTS}/{psu.slug}/price-history?days=90").get_json()
    assert [p["price_cents"] for p in body["points"]] == [psu.price_cents]
    assert body["change_cents"] == 0


def test_price_history_with_no_rows_falls_back_to_the_current_price(client, session, product_by_sku):
    psu = product_by_sku("FRG-PSU-CR-RM850E")
    _backdate(session, psu, [])
    body = client.get(f"{PRODUCTS}/{psu.slug}/price-history").get_json()
    assert [p["price_cents"] for p in body["points"]] == [psu.price_cents]


@pytest.mark.parametrize("days", [0, 6, 366])
def test_price_history_window_is_bounded(client, product_by_sku, days):
    slug = product_by_sku("FRG-CPU-R7-7800X3D").slug
    assert client.get(f"{PRODUCTS}/{slug}/price-history?days={days}").status_code == 422


def test_price_history_of_an_unknown_product_is_404(client):
    assert client.get(f"{PRODUCTS}/no-such-part/price-history").status_code == 404
