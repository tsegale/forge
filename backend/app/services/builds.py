"""Build management. Ownership is enforced here; slot limits, the ordered-build lock and the
validated-to-draft reset are enforced by the database (migrations 0002 and 0004)."""

from __future__ import annotations

from flask import current_app
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from ..errors import NotFound, ValidationFailed
from ..extensions import db
from ..models import Build, BuildItem, Product, User
from ..schemas.builds import BuildDetail, BuildItemResponse, BuildSummary
from ..schemas.catalog import Price
from .catalog import load_products, to_summary


def _price(cents: int) -> Price:
    return Price(amount_cents=cents, currency=current_app.config["STORE_CURRENCY"])


def get_owned(user: User, build_id: int, *, lock: bool = False) -> Build:
    """The user's build, or 404. Other users' builds are indistinguishable from missing ones,
    so build ids cannot be probed. ``lock`` takes SELECT ... FOR UPDATE on the build row."""
    stmt = select(Build).where(Build.id == build_id, Build.user_id == user.id)
    if lock:
        stmt = stmt.with_for_update(of=Build)
    build = db.session.scalar(stmt.options(selectinload(Build.items)))
    if build is None:
        raise NotFound("Build not found.")
    return build


def _owned_item(build: Build, item_id: int) -> BuildItem:
    item = next((i for i in build.items if i.id == item_id), None)
    if item is None:
        raise NotFound("Build item not found.")
    return item


def _summary(build: Build, products: dict[int, Product]) -> BuildSummary:
    return BuildSummary(
        id=build.id,
        name=build.name,
        status=build.status,
        item_count=sum(i.quantity for i in build.items),
        subtotal=_price(sum(products[i.product_id].price_cents * i.quantity for i in build.items)),
        updated_at=build.updated_at,
    )


def detail(build: Build) -> BuildDetail:
    products = load_products([i.product_id for i in build.items])
    items = [
        BuildItemResponse(
            id=i.id,
            quantity=i.quantity,
            line_total=_price(products[i.product_id].price_cents * i.quantity),
            product=to_summary(products[i.product_id]),
        )
        for i in sorted(build.items, key=lambda i: i.id)
    ]
    return BuildDetail(**_summary(build, products).model_dump(), items=items)


def list_builds(user: User) -> list[BuildSummary]:
    builds = db.session.scalars(
        select(Build)
        .where(Build.user_id == user.id)
        .options(selectinload(Build.items))
        .order_by(Build.updated_at.desc(), Build.id.desc())
    ).all()
    products = load_products(list({i.product_id for b in builds for i in b.items}))
    return [_summary(b, products) for b in builds]


def create(user: User, name: str) -> Build:
    build = Build(user_id=user.id, name=name)
    db.session.add(build)
    db.session.commit()
    return build


def rename(build: Build, name: str) -> Build:
    build.name = name
    db.session.commit()
    return build


def delete(build: Build) -> None:
    db.session.delete(build)
    db.session.commit()


def add_item(build: Build, product_id: int, quantity: int) -> Build:
    product = db.session.get(Product, product_id)
    if product is None or not product.is_active:
        raise ValidationFailed(
            "That product is not available.",
            details=[
                {"field": "product_id", "message": "No active product with this id.", "type": "product_unavailable"}
            ],
        )
    build.items.append(BuildItem.for_product(product, quantity=quantity))
    db.session.commit()  # slot limits, duplicates and the ordered-build lock are enforced by the database
    return build


def update_item(build: Build, item_id: int, quantity: int) -> Build:
    _owned_item(build, item_id).quantity = quantity
    db.session.commit()
    return build


def remove_item(build: Build, item_id: int) -> Build:
    build.items.remove(_owned_item(build, item_id))
    db.session.commit()
    return build
