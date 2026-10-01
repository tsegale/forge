"""Public catalog: taxonomy, brands, product detail, listing, filtering and search."""

from urllib.parse import quote

import pytest
from sqlalchemy import event, func, select, update

from app.extensions import db
from app.models import Product
from app.services.catalog import SUBTYPES

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


# --------------------------------------------------------------------- listing and pagination


def _walk(client, query: str, limit: int) -> list[dict]:
    """Follow next_cursor to the end and return every item."""
    items, cursor = [], None
    for _ in range(100):
        url = f"{PRODUCTS}?{query}&limit={limit}" + (f"&cursor={cursor}" if cursor else "")
        body = client.get(url).get_json()
        items += body["items"]
        cursor = body["next_cursor"]
        if cursor is None:
            return items
    raise AssertionError("pagination did not terminate")


def _active_count(session) -> int:
    return session.scalar(select(func.count()).select_from(Product).where(Product.is_active))


@pytest.mark.parametrize("sort", ["name", "-name", "price", "-price", "newest"])
def test_pagination_visits_every_product_exactly_once_in_order(client, session, sort):
    items = _walk(client, f"sort={sort}", limit=7)
    ids = [i["id"] for i in items]
    assert len(ids) == len(set(ids)) == _active_count(session)
    if sort.lstrip("-") == "price":
        prices = [i["price"]["amount_cents"] for i in items]
        assert prices == sorted(prices, reverse=sort.startswith("-"))


def test_pagination_is_stable_across_ties(client, session):
    """Many equal sort keys: the id tiebreaker must still give a total order."""
    session.execute(update(Product).where(Product.kind_code == "cpu").values(price_cents=100_000))
    items = _walk(client, "kind=cpu&sort=price", limit=3)
    ids = [i["id"] for i in items]
    assert ids == sorted(ids) and len(ids) == len(set(ids))


def test_page_is_unaffected_by_rows_inserted_before_the_cursor(client, session, product_by_sku):
    first = client.get(f"{PRODUCTS}?sort=price&limit=5").get_json()
    cheaper = product_by_sku("FRG-CPU-R5-7600X")
    cheaper.price_cents = 1  # moves a product onto an already-served page
    session.flush()
    second = client.get(f"{PRODUCTS}?sort=price&limit=5&cursor={first['next_cursor']}").get_json()
    assert min(i["price"]["amount_cents"] for i in second["items"]) >= first["items"][-1]["price"]["amount_cents"]


def test_tampered_cursor_is_400(client):
    cursor = client.get(f"{PRODUCTS}?limit=2").get_json()["next_cursor"]
    response = client.get(f"{PRODUCTS}?limit=2&cursor={cursor[:-2]}xx")
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "invalid_cursor"


def test_cursor_cannot_be_reused_with_different_filters(client):
    cursor = client.get(f"{PRODUCTS}?kind=cpu&limit=2").get_json()["next_cursor"]
    response = client.get(f"{PRODUCTS}?kind=gpu&limit=2&cursor={cursor}")
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "cursor_mismatch"
    assert client.get(f"{PRODUCTS}?kind=cpu&limit=5&cursor={cursor}").status_code == 200  # page size may change


def test_listing_query_count_does_not_grow_with_page_size(client):
    statements: list[str] = []

    def count(conn, cursor, statement, *args):
        statements.append(statement)

    event.listen(db.engine, "before_cursor_execute", count)
    try:
        client.get(f"{PRODUCTS}?limit=5")
        small = len(statements)
        statements.clear()
        client.get(f"{PRODUCTS}?limit=100")
        large = len(statements)
    finally:
        event.remove(db.engine, "before_cursor_execute", count)
    # One query per spec kind on the page plus fixed overhead, never one per product.
    assert large <= 15
    assert large - small <= len(SUBTYPES)


# --------------------------------------------------------------------- filters


def test_kind_brand_and_price_filters(client):
    items = _walk(client, "kind=gpu&brand=nvidia,asus&min_price=1000000&max_price=3000000", limit=50)
    assert items
    for item in items:
        assert item["kind"] == "gpu"
        assert item["brand"]["slug"] in {"nvidia", "asus"}
        assert 1_000_000 <= item["price"]["amount_cents"] <= 3_000_000


def test_brand_filter_accepts_repeated_parameters(client):
    brands = {i["brand"]["slug"] for i in _walk(client, "kind=gpu&brand=nvidia&brand=sapphire", limit=50)}
    assert brands == {"nvidia", "sapphire"}


def test_category_includes_subcategories(client):
    kinds = {i["kind"] for i in _walk(client, "category=components", limit=100)}
    assert "accessory" not in kinds and {"cpu", "gpu", "case"} <= kinds


def test_in_stock_filter(client, session, product_by_sku):
    product = product_by_sku("FRG-CPU-R7-7800X3D")
    product.inventory.quantity_on_hand = 0
    session.flush()
    in_stock = {i["id"] for i in _walk(client, "in_stock=true", limit=100)}
    out_of_stock = {i["id"] for i in _walk(client, "in_stock=false", limit=100)}
    assert product.id in out_of_stock and product.id not in in_stock
    assert all(i["availability"]["in_stock"] for i in _walk(client, "in_stock=true", limit=100))


@pytest.mark.parametrize(
    ("query", "check"),
    [
        ("kind=cpu&socket=AM5&cores_min=8", lambda s: s["socket_code"] == "AM5" and s["cores"] >= 8),
        ("kind=cpu&has_integrated_graphics=false", lambda s: s["has_integrated_graphics"] is False),
        ("kind=motherboard&memory_type=ddr5", lambda s: s["memory_type"] == "ddr5"),
        ("kind=memory&capacity_min_gb=32&speed_min_mts=6000", lambda s: s["total_capacity_gb"] >= 32),
        ("kind=gpu&vram_min_gb=16&length_max_mm=340", lambda s: s["vram_gb"] >= 16 and s["length_mm"] <= 340),
        ("kind=gpu&chipset=rtx%2050", lambda s: "RTX 50" in s["chipset"]),
        ("kind=case&form_factor=Mini-ITX", lambda s: "Mini-ITX" in s["supported_form_factors"]),
        ("kind=case&fits_gpu_length_mm=350", lambda s: s["max_gpu_length_mm"] >= 350),
        ("kind=cooler&socket=AM5&cooler_type=air", lambda s: "AM5" in s["supported_sockets"]),
        ("kind=psu&wattage_min_w=850&modularity=fully_modular", lambda s: s["wattage_w"] >= 850),
        ("kind=storage&interface=nvme&capacity_min_gb=2000", lambda s: s["interface"] == "nvme"),
    ],
)
def test_spec_filters(client, query, check):
    items = _walk(client, query, limit=50)
    assert items, f"seed data should match {query}"
    assert all(check(i["specs"]) for i in items)


@pytest.mark.parametrize(
    ("query", "code"),
    [
        ("socket=AM5", "kind_required"),
        ("kind=gpu&socket=AM5", "filter_not_applicable"),
    ],
)
def test_spec_filter_misuse_is_422(client, query, code):
    response = client.get(f"{PRODUCTS}?{query}")
    assert response.status_code == 422
    assert response.get_json()["error"]["details"][0]["type"] == code


@pytest.mark.parametrize(
    "query", ["colour=red", "sort=popularity", "limit=0", "limit=101", "min_price=500&max_price=100", "kind=laptop"]
)
def test_invalid_listing_parameters_are_422(client, query):
    assert client.get(f"{PRODUCTS}?{query}").status_code == 422


def test_inactive_products_are_not_listed(client, session, product_by_sku):
    product = product_by_sku("FRG-CPU-R7-7800X3D")
    product.is_active = False
    session.flush()
    assert product.id not in {i["id"] for i in _walk(client, "kind=cpu", limit=50)}


# --------------------------------------------------------------------- search

X3D = {"AMD Ryzen 7 7800X3D", "AMD Ryzen 7 9800X3D", "AMD Ryzen 7 5800X3D"}


def _names(client, query: str) -> list[str]:
    response = client.get(f"{PRODUCTS}?{query}")
    assert response.status_code == 200, response.get_json()
    return [i["name"] for i in response.get_json()["items"]]


def test_fragment_inside_a_model_number_matches(client):
    """The headline case: full-text search alone finds nothing for "x3d"."""
    assert set(_names(client, "q=x3d")) == X3D


@pytest.mark.parametrize(
    ("q", "first"),
    [
        ("7800x3d", "AMD Ryzen 7 7800X3D"),
        ("ryzen 7800X3D", "AMD Ryzen 7 7800X3D"),
        ("rtx 5080", "NVIDIA GeForce RTX 5080 Founders Edition 16GB"),
    ],
)
def test_best_match_ranks_first(client, q, first):
    assert _names(client, f"q={q}")[0] == first


def test_typos_still_match(client):
    names = _names(client, "q=ryzn&limit=50")
    assert names and all("Ryzen" in n for n in names)


def test_search_combines_with_filters(client):
    items = client.get(f"{PRODUCTS}?q=ryzen&kind=cpu&socket=AM4&limit=50").get_json()["items"]
    assert items and all(i["specs"]["socket_code"] == "AM4" for i in items)


@pytest.mark.parametrize("q", ["%", "_", "\\"])
def test_like_metacharacters_are_literal(client, q):
    """Unescaped, "%" or "_" would match every product. Escaped, only literal occurrences match
    (the seed has exactly one: "WD_BLACK SN850X")."""
    items = client.get(f"{PRODUCTS}?q={quote(q)}&limit=100").get_json()["items"]
    assert all(q in i["name"] or q in i["sku"] for i in items)
    assert len(items) <= 1


def test_relevance_pagination_is_complete_and_duplicate_free(client):
    everything = [i["id"] for i in client.get(f"{PRODUCTS}?q=amd&limit=100").get_json()["items"]]
    paged = [i["id"] for i in _walk(client, "q=amd", limit=2)]
    assert paged == everything and len(set(paged)) == len(paged) > 2


def test_explicit_sort_overrides_relevance(client):
    items = client.get(f"{PRODUCTS}?q=x3d&sort=price").get_json()["items"]
    prices = [i["price"]["amount_cents"] for i in items]
    assert prices == sorted(prices)


def test_relevance_sort_requires_a_query(client):
    response = client.get(f"{PRODUCTS}?sort=relevance")
    assert response.status_code == 422
    assert response.get_json()["error"]["details"][0]["type"] == "q_required"


def test_blank_query_lists_everything(client, session):
    assert len(_walk(client, "q=%20%20", limit=100)) == _active_count(session)
