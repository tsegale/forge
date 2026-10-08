"""Administrator order operations: fulfilment status changes and refunds. Every change runs with
the admin as the acting user, so the audit log records who did what."""

from __future__ import annotations

from collections import defaultdict

from sqlalchemy import exists, select

from ..errors import APIError, Conflict, NotFound
from ..extensions import db
from ..models import Order, OrderStatusTransition, Payment, PaymentEvent, User
from ..models.enums import OrderStatus, PaymentEventKind, PaymentStatus
from ..schemas.orders import AdminActions, AdminOrderDetail, AdminOrderPage, AdminOrderSummary, OrderListQuery
from . import orders as order_service
from . import refunds
from .audit import set_actor


class RefundFailed(APIError):
    """502: the payment provider did not complete a refund."""

    status, code, message = (
        502,
        "refund_failed",
        "The payment provider did not complete the refund. It has been logged.",
    )


def get(order_number: str, *, lock: bool = False) -> Order:
    """Any order by number, or 404. ``lock`` takes SELECT ... FOR UPDATE."""
    stmt = select(Order).where(Order.order_number == order_number)
    order = db.session.scalar(stmt.with_for_update() if lock else stmt)
    if order is None:
        raise NotFound("Order not found.")
    return order


FULFILMENT_STEPS = (OrderStatus.FULFILLING, OrderStatus.SHIPPED, OrderStatus.DELIVERED)


def actions(orders: list[Order]) -> dict[int, AdminActions]:
    """Legal next actions per order, read from order_status_transitions (the table the state
    machine trigger enforces) and the payments, in two queries for any number of orders."""
    if not orders:
        return {}
    edges: dict[OrderStatus, set[OrderStatus]] = defaultdict(set)
    for src, dst in db.session.execute(
        select(OrderStatusTransition.from_status, OrderStatusTransition.to_status).where(
            OrderStatusTransition.from_status.in_({o.status for o in orders})
        )
    ):
        edges[src].add(dst)
    paid = set(
        db.session.scalars(
            select(Payment.order_id).where(
                Payment.order_id.in_([o.id for o in orders]), Payment.status == PaymentStatus.SUCCEEDED
            )
        )
    )
    return {
        o.id: AdminActions(
            next_steps=[step.value for step in FULFILMENT_STEPS if step in edges[o.status]],
            refundable=OrderStatus.REFUNDED in edges[o.status] and o.id in paid,
        )
        for o in orders
    }


def detail(order: Order) -> AdminOrderDetail:
    """Order detail with the customer's email and the legal next actions."""
    email = db.session.scalar(select(User.email).where(User.id == order.user_id))
    return AdminOrderDetail(
        **order_service.detail(order).model_dump(), **actions([order])[order.id].model_dump(), customer_email=email
    )


def list_all(query: OrderListQuery) -> AdminOrderPage:
    """Every customer's orders, paged, each with its email and legal next actions."""
    orders, next_cursor = order_service.page_rows(select(Order), query)
    emails = dict(db.session.execute(select(User.id, User.email).where(User.id.in_({o.user_id for o in orders}))).all())
    allowed = actions(orders)
    return AdminOrderPage(
        items=[
            AdminOrderSummary(
                **order_service.summary(o).model_dump(),
                **allowed[o.id].model_dump(),
                customer_email=emails[o.user_id],
            )
            for o in orders
        ],
        next_cursor=next_cursor,
    )


def advance(admin: User, order_number: str, to: str) -> Order:
    """The database state machine decides what is legal (409 invalid_status_transition)."""
    order = get(order_number, lock=True)
    set_actor(db.session, admin.id)
    order.status = OrderStatus(to)
    db.session.commit()
    return order


def _transition_allowed(src: OrderStatus, dst: OrderStatus) -> bool:
    return db.session.scalar(
        select(exists().where(OrderStatusTransition.from_status == src, OrderStatusTransition.to_status == dst))
    )


def refund(admin: User, order_number: str, reason: str | None) -> Order:
    """Refund the order's successful payment in full.

    Checked before any money moves: the order must be allowed to become refunded from its current
    status (a shipped order cannot), and it must have a succeeded payment. The request is recorded
    and committed, the provider is called outside any transaction, and the outcome is recorded."""
    order = get(order_number, lock=True)
    if not _transition_allowed(order.status, OrderStatus.REFUNDED):
        raise Conflict(f"An order that is {order.status.value} cannot be refunded.", code="refund_not_allowed")
    payment = db.session.scalar(
        select(Payment)
        .where(Payment.order_id == order.id, Payment.status == PaymentStatus.SUCCEEDED)
        .order_by(Payment.id.desc())
    )
    if payment is None:
        raise Conflict("This order has no successful payment to refund.", code="nothing_to_refund")
    db.session.add(
        PaymentEvent(
            order_id=order.id,
            payment_id=payment.id,
            kind=PaymentEventKind.REFUND_REQUESTED,
            details={"reason": reason} if reason else {},
            actor_user_id=admin.id,
        )
    )
    order_id, payment_id, number = order.id, payment.id, order.order_number
    db.session.commit()

    ok = refunds.refund(
        order_id=order_id,
        payment_id=payment_id,
        idempotency_key=f"forge-order-{number}-refund",
        succeeded_kind=PaymentEventKind.REFUNDED,
        actor_user_id=admin.id,
    )
    if not ok:
        raise RefundFailed()
    return db.session.get(Order, order_id)
