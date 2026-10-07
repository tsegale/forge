"""Administrator endpoints. Every route requires the admin role."""

from __future__ import annotations

from flask import request
from sqlalchemy import or_, select
from sqlalchemy.orm.exc import StaleDataError

from ...errors import NotFound, PreconditionFailed, PreconditionRequired
from ...extensions import db
from ...models import Inventory, Product
from ...models.enums import UserRole
from ...schemas.admin import (
    AdminProductPage,
    AdminProductQuery,
    AdminProductResponse,
    AdminProductRow,
    InventoryResponse,
    ProductUpdate,
    StockUpdate,
)
from ...schemas.admin_insights import AuditLog, AuditQuery, LogQuery, Metrics, MetricsQuery, WebhookLog
from ...schemas.orders import AdminOrderDetail, AdminOrderPage, AdminStatusChange, OrderListQuery, RefundRequest
from ...security.guards import current_user, require_role
from ...services import admin_insights, admin_orders
from ...services.audit import set_actor
from ...services.catalog_query import ilike_contains
from ..spec import api, responses
from . import bp

TAG = "Admin"
SECURITY = {"bearerAuth": []}


@bp.get("/admin/products")
@require_role(UserRole.ADMIN)
@api.validate(
    query=AdminProductQuery, resp=responses(401, 403, 422, HTTP_200=AdminProductPage), tags=[TAG], security=SECURITY
)
def list_products():
    """All products, including inactive ones, with stock levels. Keyset-paged by id."""
    query: AdminProductQuery = request.context.query
    stmt = select(Product, Inventory).join(Inventory, Inventory.product_id == Product.id)
    if query.kind:
        stmt = stmt.where(Product.kind_code == query.kind)
    if query.active is not None:
        stmt = stmt.where(Product.is_active.is_(query.active))
    if query.q:
        stmt = stmt.where(or_(ilike_contains(Product.name, query.q), ilike_contains(Product.sku, query.q)))
    if query.cursor:
        stmt = stmt.where(Product.id > query.cursor)
    rows = db.session.execute(stmt.order_by(Product.id).limit(query.limit + 1)).all()
    page = rows[: query.limit]
    return AdminProductPage(
        items=[
            AdminProductRow(
                id=p.id,
                sku=p.sku,
                name=p.name,
                kind_code=p.kind_code,
                price_cents=p.price_cents,
                is_active=p.is_active,
                quantity_on_hand=inv.quantity_on_hand,
                quantity_reserved=inv.quantity_reserved,
                quantity_available=inv.quantity_available,
                version=inv.version,
            )
            for p, inv in page
        ],
        next_cursor=page[-1][0].id if len(rows) > query.limit else None,
    )


@bp.patch("/admin/products/<int:product_id>")
@require_role(UserRole.ADMIN)
@api.validate(
    json=ProductUpdate, resp=responses(401, 403, 404, 422, HTTP_200=AdminProductResponse), tags=[TAG], security=SECURITY
)
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
    if "price_cents" in body.model_fields_set:
        from ...tasks import check_price_alerts  # the task module imports the services

        check_price_alerts.delay(product_id)
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
@api.validate(resp=responses(401, 403, 404, HTTP_200=InventoryResponse), tags=[TAG], security=SECURITY)
def get_inventory(product_id: int):
    """Current stock levels. The ETag header carries the version required to update them."""
    inventory = _get_inventory(product_id)
    return InventoryResponse.model_validate(inventory), 200, _etag(inventory)


@bp.patch("/admin/inventory/<int:product_id>")
@require_role(UserRole.ADMIN)
@api.validate(
    json=StockUpdate,
    resp=responses(401, 403, 404, 409, 412, 422, 428, HTTP_200=InventoryResponse),
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


# --------------------------------------------------------------------------- orders


@bp.get("/admin/orders")
@require_role(UserRole.ADMIN)
@api.validate(
    query=OrderListQuery, resp=responses(401, 403, 422, HTTP_200=AdminOrderPage), tags=[TAG], security=SECURITY
)
def admin_list_orders():
    """All orders, newest first, optionally filtered by status, with each order's customer and the
    actions an administrator may take next."""
    return admin_orders.list_all(request.context.query)


@bp.get("/admin/orders/<string:order_number>")
@require_role(UserRole.ADMIN)
@api.validate(resp=responses(401, 403, 404, HTTP_200=AdminOrderDetail), tags=[TAG], security=SECURITY)
def admin_get_order(order_number: str):
    """Any order, with the customer's email."""
    return admin_orders.detail(admin_orders.get(order_number))


@bp.post("/admin/orders/<string:order_number>/status")
@require_role(UserRole.ADMIN)
@api.validate(
    json=AdminStatusChange,
    resp=responses(401, 403, 404, 409, 422, HTTP_200=AdminOrderDetail),
    tags=[TAG],
    security=SECURITY,
)
def admin_advance_order(order_number: str):
    """Move a paid order through fulfilment: fulfilling, shipped, delivered. The database rejects
    illegal jumps (409 invalid_status_transition). Recorded in the status history with the admin."""
    order = admin_orders.advance(current_user(), order_number, request.context.json.to)
    return admin_orders.detail(order)


@bp.post("/admin/orders/<string:order_number>/refund")
@require_role(UserRole.ADMIN)
@api.validate(
    json=RefundRequest,
    resp=responses(401, 403, 404, 409, 502, HTTP_200=AdminOrderDetail),
    tags=[TAG],
    security=SECURITY,
)
def admin_refund_order(order_number: str):
    """Refund the order's payment in full through Stripe. 409 if the order cannot be refunded in
    its current state (checked before any money moves); 502 if Stripe did not complete it."""
    order = admin_orders.refund(current_user(), order_number, request.context.json.reason)
    return admin_orders.detail(order)


@bp.get("/admin/metrics")
@require_role(UserRole.ADMIN)
@api.validate(query=MetricsQuery, resp=responses(401, 403, 422, HTTP_200=Metrics), tags=[TAG], security=SECURITY)
def metrics():
    """Sales over the last `days` (revenue, orders, units, refunds, a zero-filled daily series in
    the store's time zone), orders by status, low stock and best sellers."""
    return admin_insights.metrics(request.context.query.days)


@bp.get("/admin/webhooks")
@require_role(UserRole.ADMIN)
@api.validate(query=LogQuery, resp=responses(401, 403, 422, HTTP_200=WebhookLog), tags=[TAG], security=SECURITY)
def webhook_log():
    """The payment provider's events as applied (the idempotency ledger), newest first."""
    q: LogQuery = request.context.query
    items, next_before = admin_insights.webhooks(q.limit, q.before)
    return WebhookLog(items=items, next_before=next_before)


@bp.get("/admin/audit")
@require_role(UserRole.ADMIN)
@api.validate(query=AuditQuery, resp=responses(401, 403, 422, HTTP_200=AuditLog), tags=[TAG], security=SECURITY)
def audit_log():
    """One trail over order status changes, stock events, price changes and payment events
    (all written by the database itself), newest first, with who did it."""
    q: AuditQuery = request.context.query
    items, next_before = admin_insights.audit(q.kind, q.limit, q.before)
    return AuditLog(items=items, next_before=next_before)
