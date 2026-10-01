"""Catalog reads: taxonomy, brands, and product serialisation."""

from __future__ import annotations

from flask import current_app
from sqlalchemy import Select, select
from sqlalchemy.orm import selectin_polymorphic, selectinload

from ..errors import NotFound
from ..extensions import db
from ..models import (
    AccessoryProduct,
    Brand,
    CaseProduct,
    Category,
    CoolerProduct,
    CpuProduct,
    GpuProduct,
    MemoryProduct,
    MotherboardProduct,
    Product,
    PsuProduct,
    StorageProduct,
)
from ..schemas.catalog import (
    SPEC_MODELS,
    AccessorySpecs,
    Availability,
    BrandResponse,
    CategoryNode,
    CategoryRef,
    Price,
    ProductDetail,
    ProductSummary,
)

SUBTYPES = [
    CpuProduct,
    MotherboardProduct,
    MemoryProduct,
    GpuProduct,
    StorageProduct,
    PsuProduct,
    CaseProduct,
    CoolerProduct,
    AccessoryProduct,
]


def product_query(*, active_only: bool = True) -> Select[tuple[Product]]:
    """Products with spec columns, brand and stock loaded in a fixed number of queries:
    one per spec kind present on the page (selectin_polymorphic), not one per product."""
    stmt = select(Product).options(selectin_polymorphic(Product, SUBTYPES), selectinload(Product.inventory))
    return stmt.where(Product.is_active) if active_only else stmt


def load_products(ids: list[int]) -> dict[int, Product]:
    """Products by id, including inactive ones (a saved build keeps parts that were delisted)."""
    if not ids:
        return {}
    return {p.id: p for p in db.session.scalars(product_query(active_only=False).where(Product.id.in_(ids)))}


def category_tree() -> list[CategoryNode]:
    rows = db.session.scalars(select(Category).order_by(Category.name)).all()
    nodes = {c.id: CategoryNode(id=c.id, name=c.name, slug=c.slug, kind=c.kind_code) for c in rows}
    roots: list[CategoryNode] = []
    for c in rows:
        (nodes[c.parent_id].children if c.parent_id else roots).append(nodes[c.id])
    return roots


def list_brands() -> list[BrandResponse]:
    return [BrandResponse.model_validate(b) for b in db.session.scalars(select(Brand).order_by(Brand.name))]


def _specs(product: Product):
    if isinstance(product, AccessoryProduct):
        return AccessorySpecs(attributes=product.attributes)
    return SPEC_MODELS[product.kind_code].model_validate(product)


def to_summary(product: Product) -> ProductSummary:
    available = product.inventory.quantity_available
    return ProductSummary(
        id=product.id,
        sku=product.sku,
        slug=product.slug,
        name=product.name,
        kind=product.kind_code,
        brand=BrandResponse.model_validate(product.brand),
        price=Price(amount_cents=product.price_cents, currency=current_app.config["STORE_CURRENCY"]),
        availability=Availability(in_stock=available > 0, quantity_available=max(available, 0)),
        specs=_specs(product),
    )


def get_product(slug: str) -> ProductDetail:
    product = db.session.scalar(product_query().where(Product.slug == slug).options(selectinload(Product.category)))
    if product is None:
        raise NotFound("Product not found.")
    summary = to_summary(product)
    return ProductDetail(
        **summary.model_dump(exclude={"specs"}),
        specs=summary.specs,
        description=product.description,
        category=CategoryRef.model_validate(product.category),
    )
