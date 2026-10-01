"""Administrator endpoints. Every route requires the admin role."""

from __future__ import annotations

from flask import request
from spectree import Response as Resp

from ...errors import NotFound
from ...extensions import db
from ...models import Product
from ...models.enums import UserRole
from ...schemas.admin import AdminProductResponse, ProductUpdate
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
