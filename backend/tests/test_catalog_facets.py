"""Filter-sidebar facets: totals that match the listing, and disjunctive brand, price and stock counts."""

from collections import Counter

import pytest
from sqlalchemy import update

from app.models import Inventory

PRODUCTS = "/api/v1/products"
FACETS = "/api/v1/products/facets"


def _all(client, query: str) -> list[dict]:
    body = client.get(f"{PRODUCTS}?limit=100&{query}").get_json()
    assert body["next_cursor"] is None
    return body["items"]


def _facets(client, query: str) -> dict:
    response = client.get(f"{FACETS}?{query}")
    assert response.status_code == 200, response.get_json()
    return response.get_json()


@pytest.mark.parametrize("query", ["kind=cpu", "kind=gpu&vram_min_gb=12", "q=ryzen", "kind=memory&brand=corsair"])
def test_total_matches_the_listing(client, query):
    assert _facets(client, query)["total"] == len(_all(client, query))


def test_brand_counts_ignore_the_brand_filter(client):
    expected = Counter(p["brand"]["slug"] for p in _all(client, "kind=cpu"))
    facets = _facets(client, "kind=cpu&brand=amd")
    assert {b["slug"]: b["count"] for b in facets["brands"]} == dict(expected)
    assert facets["total"] == expected["amd"]
    counts = [b["count"] for b in facets["brands"]]
    assert counts == sorted(counts, reverse=True)


def test_price_span_ignores_the_price_filters(client):
    prices = [p["price"]["amount_cents"] for p in _all(client, "kind=gpu")]
    facets = _facets(client, f"kind=gpu&max_price={min(prices)}")
    assert facets["price"] == {"min_cents": min(prices), "max_cents": max(prices)}
    assert facets["total"] == prices.count(min(prices))


def test_in_stock_counts_ignore_the_stock_filter(client, session, product_by_sku):
    sold_out = product_by_sku("FRG-CPU-R7-7800X3D")
    session.execute(
        update(Inventory).where(Inventory.product_id == sold_out.id).values(quantity_on_hand=0, quantity_reserved=0)
    )
    cpus = _all(client, "kind=cpu")
    facets = _facets(client, "kind=cpu&in_stock=false")
    assert facets["in_stock"] == sum(p["availability"]["in_stock"] for p in cpus)
    assert facets["in_stock"] < len(cpus)
    assert facets["total"] == len(cpus) - facets["in_stock"]


def test_no_matches_has_no_price_span(client):
    facets = _facets(client, "q=zzzzqqqq")
    assert facets == {"total": 0, "incompatible": None, "in_stock": 0, "kinds": [], "brands": [], "price": None}


def test_kind_counts_ignore_the_kind_and_its_spec_filters(client):
    expected = Counter(p["kind"] for p in _all(client, "q=asus"))
    facets = _facets(client, "q=asus&kind=gpu&vram_min_gb=12")
    assert {k["kind"]: k["count"] for k in facets["kinds"]} == dict(expected)
    assert len(expected) > 1  # ASUS makes boards and graphics cards, or the test proves little


def test_incompatible_counts_what_the_build_filter_left_out(client, product_by_sku):
    board = product_by_sku("FRG-MB-MSI-B650-TOMAHAWK").id  # AM5
    every = len(_all(client, "kind=cpu"))
    facets = _facets(client, f"kind=cpu&compatible_with={board}")
    assert facets["total"] == len(_all(client, f"kind=cpu&compatible_with={board}"))
    assert facets["incompatible"] == every - facets["total"] > 0


def test_facets_reject_listing_only_parameters(client):
    assert client.get(f"{FACETS}?kind=cpu&sort=price").status_code == 422
    assert client.get(f"{FACETS}?socket=AM5").status_code == 422  # spec filters still need a kind
