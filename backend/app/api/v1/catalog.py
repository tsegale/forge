"""Public catalog endpoints."""

from __future__ import annotations

from spectree import Response as Resp

from ...schemas.catalog import BrandList, CategoryList, ProductDetail
from ...services import catalog as catalog_service
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
