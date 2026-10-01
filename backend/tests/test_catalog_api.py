"""Public catalog: taxonomy, brands, product detail, listing, filtering and search."""

import pytest
from sqlalchemy import select

from app.models import Product

CATEGORIES = "/api/v1/categories"
BRANDS = "/api/v1/brands"
PRODUCTS = "/api/v1/products"


# --------------------------------------------------------------------- taxonomy and brands


def test_category_tree(client):
    response = client.get(CATEGORIES)
    assert response.status_code == 200
    roots = {c["slug"]: c for c in response.get_json()["items"]}
    assert set(roots) == {"components", "accessories"}
    assert roots["components"]["kind"] is None
    leaves = {c["slug"]: c["kind"] for c in roots["components"]["children"]}
    assert leaves["processors"] == "cpu" and leaves["graphics-cards"] == "gpu"


def test_brands_are_sorted(client):
    names = [b["name"] for b in client.get(BRANDS).get_json()["items"]]
    assert names == sorted(names) and "AMD" in names


# --------------------------------------------------------------------- product detail


def test_cpu_detail_has_typed_specs(client, product_by_sku):
    product = product_by_sku("FRG-CPU-R7-7800X3D")
    response = client.get(f"{PRODUCTS}/{product.slug}")
    assert response.status_code == 200
    body = response.get_json()
    assert body["sku"] == "FRG-CPU-R7-7800X3D"
    assert body["price"] == {"amount_cents": product.price_cents, "currency": "nad"}
    assert body["specs"]["kind"] == "cpu" and body["specs"]["socket_code"] == "AM5"
    assert body["category"]["slug"] == "processors"
    assert body["availability"]["quantity_available"] == product.inventory.quantity_available


@pytest.mark.parametrize(
    ("kind", "spec_field"),
    [
        ("memory", "height_mm"),
        ("gpu", "slot_width"),
        ("case", "supported_form_factors"),
        ("cooler", "supported_sockets"),
        ("accessory", "attributes"),
    ],
)
def test_every_kind_serialises(client, session, kind, spec_field):
    product = session.scalar(select(Product).where(Product.kind_code == kind).limit(1))
    body = client.get(f"{PRODUCTS}/{product.slug}").get_json()
    assert body["specs"]["kind"] == kind
    assert spec_field in body["specs"]
    if spec_field in ("height_mm", "slot_width"):
        assert isinstance(body["specs"][spec_field], float)  # numeric dimension, not a string


def test_out_of_stock_reports_zero_available(client, session, product_by_sku):
    product = product_by_sku("FRG-CPU-R7-7800X3D")
    product.inventory.quantity_on_hand = product.inventory.quantity_reserved = 4
    session.flush()
    availability = client.get(f"{PRODUCTS}/{product.slug}").get_json()["availability"]
    assert availability == {"in_stock": False, "quantity_available": 0}


def test_inactive_products_are_hidden(client, session, product_by_sku):
    product = product_by_sku("FRG-CPU-R7-7800X3D")
    product.is_active = False
    session.flush()
    assert client.get(f"{PRODUCTS}/{product.slug}").status_code == 404


def test_unknown_product_is_404(client):
    response = client.get(f"{PRODUCTS}/no-such-part")
    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "not_found"
