"""What the home page shows, computed from the database's own history.

* Price drops: each product's latest price change, from price_history, when it was a cut, made
  within the window, and still the price today. LAG over the product's history gives the price
  before the change in one pass.
* Back in stock: products whose latest stock event (inventory_events, written by trigger) took
  what is available from none to some, within the window, and that are still available.
* Featured builds: public builds marked featured whose status is validated (an edit returns a
  build to draft, so a featured build that stops being valid simply drops out).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from flask import current_app
from sqlalchemy import and_, func, select
from sqlalchemy.dialects.postgresql import distinct_on
from sqlalchemy.orm import selectinload

from ..extensions import db
from ..models import Build, Inventory, InventoryEvent, PriceHistory, Product
from ..models.enums import BuildStatus
from ..schemas.catalog import Price
from ..schemas.home import BackInStock, FeaturedBuild, PriceDrop
from .builds import detail
from .catalog import load_products, to_summary


def _since(days: int) -> datetime:
    return datetime.now(UTC) - timedelta(days=days)


def price_drops(limit: int, days: int) -> list[PriceDrop]:
    """Products whose latest price change in the window was a drop, biggest percentage first."""
    ranked = select(
        PriceHistory.product_id,
        PriceHistory.recorded_at,
        PriceHistory.price_cents,
        func.lag(PriceHistory.price_cents)
        .over(partition_by=PriceHistory.product_id, order_by=PriceHistory.recorded_at)
        .label("previous_cents"),
        func.row_number()
        .over(partition_by=PriceHistory.product_id, order_by=PriceHistory.recorded_at.desc())
        .label("newest_first"),
    ).subquery()
    available = Inventory.quantity_on_hand - Inventory.quantity_reserved
    saving = ranked.c.previous_cents - ranked.c.price_cents
    rows = db.session.execute(
        select(ranked.c.product_id, ranked.c.recorded_at, ranked.c.previous_cents)
        .join(Product, Product.id == ranked.c.product_id)
        .join(Inventory, Inventory.product_id == Product.id)
        .where(
            ranked.c.newest_first == 1,
            ranked.c.recorded_at >= _since(days),
            ranked.c.previous_cents > ranked.c.price_cents,
            Product.price_cents == ranked.c.price_cents,  # still today's price
            Product.is_active,
            available > 0,
        )
        .order_by((saving * 1.0 / ranked.c.previous_cents).desc(), ranked.c.product_id)
        .limit(limit)
    ).all()
    products = load_products([r.product_id for r in rows])
    currency = current_app.config["STORE_CURRENCY"]
    drops = []
    for product_id, at, previous in rows:
        product = products[product_id]
        cut = previous - product.price_cents
        drops.append(
            PriceDrop(
                product=to_summary(product),
                was=Price(amount_cents=previous, currency=currency),
                saving_cents=cut,
                percent_off=cut * 100 // previous,
                dropped_at=at,
            )
        )
    return drops


def back_in_stock(limit: int, days: int) -> list[BackInStock]:
    """Products restocked in the window that are available now, most recent first."""
    latest = (
        select(InventoryEvent)
        .ext(distinct_on(InventoryEvent.product_id))
        .order_by(InventoryEvent.product_id, InventoryEvent.occurred_at.desc(), InventoryEvent.id.desc())
        .subquery()
    )
    available = Inventory.quantity_on_hand - Inventory.quantity_reserved
    rows = db.session.execute(
        select(latest.c.product_id, latest.c.occurred_at)
        .join(Product, Product.id == latest.c.product_id)
        .join(Inventory, Inventory.product_id == Product.id)
        .where(
            and_(
                latest.c.occurred_at >= _since(days),
                latest.c.on_hand_before - latest.c.reserved_before <= 0,
                latest.c.on_hand_after - latest.c.reserved_after > 0,
            ),
            Product.is_active,
            available > 0,
        )
        .order_by(latest.c.occurred_at.desc(), latest.c.product_id)
        .limit(limit)
    ).all()
    products = load_products([r.product_id for r in rows])
    return [BackInStock(product=to_summary(products[pid]), restocked_at=at) for pid, at in rows]


def featured_builds() -> list[FeaturedBuild]:
    """Featured builds that are public and currently validated."""
    builds = db.session.scalars(
        select(Build)
        .where(Build.is_featured, Build.is_public, Build.status == BuildStatus.VALIDATED)
        .options(selectinload(Build.items))
        .order_by(Build.id)
    ).all()
    return [
        FeaturedBuild(
            **detail(build).model_dump(),
            blurb=build.featured_blurb,
            share_slug=build.share_slug or "",
            compatible=True,
        )
        for build in builds
    ]
