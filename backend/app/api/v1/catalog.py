"""Public catalog endpoints."""

from __future__ import annotations

from flask import request
from spectree import Response as Resp

from ...schemas.catalog import BrandList, CategoryList, ProductDetail, ProductPage, ProductQuery
from ...services import catalog as catalog_service
from ...services import catalog_query
from ..spec import api
from . import bp

TAG = "Catalog"


@bp.get("/categories")
@api.validate(resp=Resp(HTTP_200=CategoryList), tags=[TAG])
def categories():
    """The browsing taxonomy as a tree. Leaf categories carry the component kind they sell."""
    return CategoryList(items=catalog_service.category_tree())


@bp.get("/brands")
@api.validate(resp=Resp(HTTP_200=BrandList), tags=[TAG])
def brands():
    """All brands, alphabetically."""
    return BrandList(items=catalog_service.list_brands())


@bp.get("/products/<string:slug>")
@api.validate(resp=Resp(HTTP_200=ProductDetail, HTTP_404=None), tags=[TAG])
def product_detail(slug: str):
    """A single active product with its full specifications and availability."""
    return catalog_service.get_product(slug)


@bp.get("/products")
@api.validate(query=ProductQuery, resp=Resp(HTTP_200=ProductPage), tags=[TAG])
def products():
    """Active products, filtered and sorted, with keyset pagination.

    Spec filters (socket, cores_min, vram_min_gb, ...) require `kind`. Follow `next_cursor`
    for further pages; a cursor is only valid for the query that produced it."""
    return catalog_query.list_products(request.context.query)
