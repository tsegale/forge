"""Catalog reads: taxonomy, brands, and product serialisation."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from flask import current_app
from sqlalchemy import Select, func, select
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
    PriceHistory,
    Product,
    PsuProduct,
    Review,
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
    PriceHistoryResponse,
    PricePoint,
    ProductDetail,
    ProductSummary,
    RatingSummary,
)
from .media import image_response

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
    """The category tree, alphabetical at every level."""
    rows = db.session.scalars(select(Category).order_by(Category.name)).all()
    nodes = {c.id: CategoryNode(id=c.id, name=c.name, slug=c.slug, kind=c.kind_code) for c in rows}
    roots: list[CategoryNode] = []
    for c in rows:
        (nodes[c.parent_id].children if c.parent_id else roots).append(nodes[c.id])
    return roots


def list_brands() -> list[BrandResponse]:
    """All brands, alphabetical."""
    return [BrandResponse.model_validate(b) for b in db.session.scalars(select(Brand).order_by(Brand.name))]


def _specs(product: Product):
    if isinstance(product, AccessoryProduct):
        return AccessorySpecs(attributes=product.attributes)
    return SPEC_MODELS[product.kind_code].model_validate(product)


def to_summary(product: Product) -> ProductSummary:
    """A product as listed in the catalog: price, availability, specs and main image."""
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
        image=image_response(product.images[0]) if product.images else None,
    )


def get_active(slug: str) -> Product:
    """An active product by slug, or 404."""
    product = db.session.scalar(product_query().where(Product.slug == slug).options(selectinload(Product.category)))
    if product is None:
        raise NotFound("Product not found.")
    return product


def rating_summary(product_id: int) -> RatingSummary:
    """Average rating (rounded by PostgreSQL) and review count for a product."""
    average, count = db.session.execute(
        select(func.round(func.avg(Review.rating), 1), func.count()).where(Review.product_id == product_id)
    ).one()
    return RatingSummary(average=float(average) if average is not None else None, count=count)


def get_product(slug: str) -> ProductDetail:
    """The product detail page payload: summary, description, category and images."""
    product = get_active(slug)
    summary = to_summary(product)
    return ProductDetail(
        **summary.model_dump(exclude={"specs", "image"}),
        specs=summary.specs,
        image=summary.image,
        description=product.description,
        category=CategoryRef.model_validate(product.category),
        images=[image_response(image) for image in product.images],
        rating=rating_summary(product.id),
    )


def price_history(slug: str, days: int) -> PriceHistoryResponse:
    """The prices in effect over the last ``days``, as a step series. The price at the start of
    the window is the last change recorded before it (partition pruning keeps that lookup cheap
    on the indexed (product_id, recorded_at) pair)."""
    product = get_active(slug)
    now = datetime.now(UTC)
    start = now - timedelta(days=days)
    opening = db.session.scalar(
        select(PriceHistory.price_cents)
        .where(PriceHistory.product_id == product.id, PriceHistory.recorded_at < start)
        .order_by(PriceHistory.recorded_at.desc())
        .limit(1)
    )
    rows = db.session.execute(
        select(PriceHistory.recorded_at, PriceHistory.price_cents)
        .where(PriceHistory.product_id == product.id, PriceHistory.recorded_at >= start)
        .order_by(PriceHistory.recorded_at)
    ).all()
    points = [PricePoint(at=start, price_cents=opening)] if opening is not None else []
    points += [PricePoint(at=at, price_cents=cents) for at, cents in rows]
    if not points:  # no history at all (a row predating the trigger): the current price is the history
        points = [PricePoint(at=start, price_cents=product.price_cents)]
    prices = [p.price_cents for p in points]
    return PriceHistoryResponse(
        currency=current_app.config["STORE_CURRENCY"],
        days=days,
        points=points,
        current_cents=product.price_cents,
        lowest_cents=min(prices),
        highest_cents=max(prices),
        change_cents=product.price_cents - points[0].price_cents,
    )
