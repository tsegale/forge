"""Run the compatibility engine against saved builds and ad-hoc part lists."""

from __future__ import annotations

from sqlalchemy import select

from ..compat import BuildContext, Part, Report, evaluate
from ..errors import ValidationFailed
from ..extensions import db
from ..models import ComponentKind, User
from ..models.enums import BuildStatus
from ..schemas.compat import CheckItem
from .builds import get_owned
from .catalog import load_products


def required_kinds() -> list[str]:
    """Kinds every complete build needs (component_kinds.required_in_build)."""
    return list(db.session.scalars(select(ComponentKind.code).where(ComponentKind.required_in_build)))


def validate_build(user: User, build_id: int) -> tuple[Report, BuildStatus]:
    """Evaluate a build and record the result in its status.

    The build row is locked (SELECT ... FOR UPDATE) before its items are read. Every item change
    takes the same lock (guard_build_items trigger), so an item added or removed while this runs
    waits until the status is written, and then resets it to draft. "validated" therefore always
    describes the items that were actually checked. An ordered build keeps its status.
    """
    build = get_owned(user, build_id, lock=True)
    products = load_products([i.product_id for i in build.items])
    ctx = BuildContext(Part(products[i.product_id], i.quantity) for i in build.items)
    report = evaluate(ctx, required_kinds())
    if build.status is not BuildStatus.ORDERED:
        build.status = BuildStatus.VALIDATED if report.compatible and report.complete else BuildStatus.DRAFT
    db.session.commit()
    return report, build.status


def check_items(items: list[CheckItem]) -> Report:
    """Evaluate a part list without saving anything. Unknown or inactive products are a 422."""
    products = load_products([i.product_id for i in items])
    unavailable = [
        {"field": f"items.{n}.product_id", "message": "No active product with this id.", "type": "product_unavailable"}
        for n, item in enumerate(items)
        if item.product_id not in products or not products[item.product_id].is_active
    ]
    if unavailable:
        raise ValidationFailed("Some products are not available.", details=unavailable)
    return evaluate(BuildContext(Part(products[i.product_id], i.quantity) for i in items), required_kinds())
