"""Administrator endpoints. Every route requires the admin role."""

from __future__ import annotations

from flask import request
from spectree import Response as Resp
from sqlalchemy.orm.exc import StaleDataError

from ...errors import NotFound, PreconditionFailed, PreconditionRequired
from ...extensions import db
from ...models import Inventory, Product
from ...models.enums import UserRole
from ...schemas.admin import AdminProductResponse, InventoryResponse, ProductUpdate, StockUpdate
from ...security.guards import current_user, require_role
from ...services.audit import set_actor
from ..spec import api
from . import bp

TAG = "Admin"
SECURITY = {"bearerAuth": []}


@bp.patch("/admin/products/<int:product_id>")
@require_role(UserRole.ADMIN)
@api.validate(json=ProductUpdate, resp=Resp(HTTP_200=AdminProductResponse), tags=[TAG], security=SECURITY)
def update_product(product_id: int):
    """Change a product's price or availability. Price changes are recorded in price_history by a trigger."""
    product = db.session.get(Product, product_id)
    if product is None:
        raise NotFound("Product not found.")
    body: ProductUpdate = request.context.json
    set_actor(db.session, current_user().id)
    for field in body.model_fields_set:
        setattr(product, field, getattr(body, field))
    db.session.commit()
    return AdminProductResponse.model_validate(product)


def _etag(inventory: Inventory) -> dict[str, str]:
    return {"ETag": f'"{inventory.version}"'}


def _get_inventory(product_id: int) -> Inventory:
    inventory = db.session.get(Inventory, product_id)
    if inventory is None:
        raise NotFound("Product not found.")
    return inventory


@bp.get("/admin/inventory/<int:product_id>")
@require_role(UserRole.ADMIN)
@api.validate(resp=Resp(HTTP_200=InventoryResponse), tags=[TAG], security=SECURITY)
def get_inventory(product_id: int):
    """Current stock levels. The ETag header carries the version required to update them."""
    inventory = _get_inventory(product_id)
    return InventoryResponse.model_validate(inventory), 200, _etag(inventory)


@bp.patch("/admin/inventory/<int:product_id>")
@require_role(UserRole.ADMIN)
@api.validate(
    json=StockUpdate,
    resp=Resp(HTTP_200=InventoryResponse, HTTP_409=None, HTTP_412=None, HTTP_428=None),
    tags=[TAG],
    security=SECURITY,
)
def update_inventory(product_id: int):
    """Set stock on hand. Requires If-Match with the current ETag (optimistic concurrency):
    412 if the stock changed since it was read, 428 if If-Match is missing, 409 if the new
    level would fall below stock already reserved by checkouts."""
    if "If-Match" not in request.headers:
        raise PreconditionRequired()
    inventory = _get_inventory(product_id)
    # Strong comparison (RFC 9110, section 13.1.1): weak validators never match If-Match.
    if not request.if_match.contains(str(inventory.version)):
        raise PreconditionFailed(headers=_etag(inventory))

    inventory.quantity_on_hand = request.context.json.quantity_on_hand
    set_actor(db.session, current_user().id)
    try:
        # version_id_col adds "AND version = <read version>" to the UPDATE, closing the window
        # between the If-Match check above and this write.
        db.session.commit()
    except StaleDataError as exc:
        db.session.rollback()
        raise PreconditionFailed() from exc
    return InventoryResponse.model_validate(inventory), 200, _etag(inventory)
