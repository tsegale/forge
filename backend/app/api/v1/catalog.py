"""Public catalog endpoints."""

from __future__ import annotations

from flask import request

from ...schemas.catalog import (
    BrandList,
    CategoryList,
    ProductDetail,
    ProductPage,
    ProductQuery,
    SearchSuggestions,
    SuggestQuery,
)
from ...services import catalog as catalog_service
from ...services import catalog_query
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


@bp.get("/products/<string:slug>")
@api.validate(resp=responses(404, HTTP_200=ProductDetail), tags=[TAG])
def product_detail(slug: str):
    """A single active product with its full specifications and availability."""
    return catalog_service.get_product(slug)


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
