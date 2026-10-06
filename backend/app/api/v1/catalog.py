"""Public catalog endpoints."""

from __future__ import annotations

from flask import request

from ...schemas.catalog import (
    BrandList,
    CategoryList,
    PriceHistoryQuery,
    PriceHistoryResponse,
    ProductDetail,
    ProductFacets,
    ProductFilters,
    ProductPage,
    ProductQuery,
    SearchSuggestions,
    SuggestQuery,
)
from ...schemas.home import BackInStockList, CollectionQuery, PriceDropList
from ...services import catalog as catalog_service
from ...services import catalog_query, home
from ...services import search as search_service
from ..spec import api, responses
from . import bp

TAG = "Catalog"


@bp.get("/categories")
@api.validate(resp=responses(HTTP_200=CategoryList), tags=[TAG])
def categories():
    """The browsing taxonomy as a tree. Leaf categories carry the component kind they sell."""
    return CategoryList(items=catalog_service.category_tree())


@bp.get("/brands")
@api.validate(resp=responses(HTTP_200=BrandList), tags=[TAG])
def brands():
    """All brands, alphabetically."""
    return BrandList(items=catalog_service.list_brands())


@bp.get("/products/price-drops")
@api.validate(query=CollectionQuery, resp=responses(422, HTTP_200=PriceDropList), tags=[TAG])
def price_drops():
    """Parts whose latest price change was a cut within `days`, still at the lower price and in
    stock, biggest percentage first. From the trigger-fed price history."""
    q: CollectionQuery = request.context.query
    return PriceDropList(items=home.price_drops(q.limit, q.days))


@bp.get("/products/back-in-stock")
@api.validate(query=CollectionQuery, resp=responses(422, HTTP_200=BackInStockList), tags=[TAG])
def back_in_stock():
    """Parts that went from none available to some within `days`, most recent first. From the
    trigger-fed inventory_events."""
    q: CollectionQuery = request.context.query
    return BackInStockList(items=home.back_in_stock(q.limit, q.days))


@bp.get("/products/facets")
@api.validate(query=ProductFilters, resp=responses(422, HTTP_200=ProductFacets), tags=[TAG])
def product_facets():
    """Counts for a filter sidebar, from the same filters as GET /products: the total, brands,
    price span and stock. Each facet ignores its own filter, so the alternatives stay visible.
    With compatible_with, also how many matches were left out as incompatible."""
    return catalog_query.product_facets(request.context.query)


@bp.get("/products/<string:slug>")
@api.validate(resp=responses(404, HTTP_200=ProductDetail), tags=[TAG])
def product_detail(slug: str):
    """A single active product with its full specifications and availability."""
    return catalog_service.get_product(slug)


@bp.get("/products/<string:slug>/price-history")
@api.validate(query=PriceHistoryQuery, resp=responses(404, 422, HTTP_200=PriceHistoryResponse), tags=[TAG])
def price_history(slug: str):
    """Prices over the last `days` (7 to 365, default 90) as a step series, with the lowest,
    highest and the change over the window. Fed by a trigger on every price change."""
    return catalog_service.price_history(slug, request.context.query.days)


@bp.get("/products")
@api.validate(query=ProductQuery, resp=responses(400, 422, HTTP_200=ProductPage), tags=[TAG])
def products():
    """Active products, filtered and sorted, with keyset pagination.

    Spec filters (socket, cores_min, vram_min_gb, ...) require `kind`. Follow `next_cursor`
    for further pages; a cursor is only valid for the query that produced it."""
    return catalog_query.list_products(request.context.query)


@bp.get("/search/suggest")
@api.validate(query=SuggestQuery, resp=responses(422, HTTP_200=SearchSuggestions), tags=[TAG])
def search_suggest():
    """Search as you type: the best matches per component kind (by name or SKU fragment), and a
    spelling correction built from catalog words when nothing matches."""
    query: SuggestQuery = request.context.query
    return search_service.suggest(query.q, query.per_kind)
