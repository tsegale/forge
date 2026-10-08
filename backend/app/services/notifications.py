"""Customer notifications. The order confirmation is sent exactly once per order: the order is
claimed (confirmation_sent_at set) in a committed transaction before sending, so no row lock is
held during the SMTP conversation; if sending fails the claim is released for the retry."""

from __future__ import annotations

from datetime import UTC, datetime
from html import escape

from sqlalchemy import select, update

from ..extensions import db
from ..models import Order, User
from ..models.enums import AddressType
from .mail import Mail, send


def format_money(cents: int, currency: str) -> str:
    """Format integer cents as money; NAD is shown as N$."""
    amount = f"{cents // 100:,}.{cents % 100:02d}"
    return f"N$ {amount}" if currency.upper() == "NAD" else f"{amount} {currency.upper()}"


RIGHT = 'style="text-align:right"'


def _row(label: str, value: str, strong: bool = False) -> str:
    if strong:
        label, value = f"<strong>{label}</strong>", f"<strong>{value}</strong>"
    return f"<tr><td>{label}</td><td {RIGHT}>{value}</td></tr>"


def confirmation(order: Order, email: str, first_name: str) -> Mail:
    """The order confirmation email."""

    def money(cents: int) -> str:
        return format_money(cents, order.currency)

    lines = sorted(order.items, key=lambda i: i.id)
    address = next((a for a in order.addresses if a.type is AddressType.SHIPPING), None)
    address_parts = (
        [address.recipient_name, address.line1, address.line2, address.city, address.postal_code] if address else []
    )
    address_lines = [part for part in address_parts if part]
    totals = [
        ("Subtotal (excl. VAT)", money(order.subtotal_cents)),
        ("Shipping (excl. VAT)", money(order.shipping_cents)),
        ("VAT (15%)", money(order.tax_cents)),
    ]

    text = "\n".join(
        [
            f"Hi {first_name},",
            "",
            f"Thank you for your order. Payment for order {order.order_number} has been received.",
            "",
            *[f"  {i.quantity} x {i.name_snapshot}  {money(i.line_total_cents)}" for i in lines],
            "",
            *[f"{label}: {value}" for label, value in totals],
            f"Total paid: {money(order.total_cents)}",
            "",
            "Shipping to:",
            *address_lines,
            "",
            "We will email you again when your order ships.",
            "Forge",
        ]
    )
    rows = "".join(_row(f"{i.quantity} x {escape(i.name_snapshot)}", money(i.line_total_cents)) for i in lines)
    rows += "".join(_row(label, value) for label, value in totals)
    rows += _row("Total paid", money(order.total_cents), strong=True)
    html = f"""<!doctype html>
<html><body style="font-family:Arial,Helvetica,sans-serif;color:#1f2933;background:#ffffff">
<p>Hi {escape(first_name)},</p>
<p>Thank you for your order. Payment for order <strong>{escape(order.order_number)}</strong> has been received.</p>
<table style="border-collapse:collapse;min-width:360px">{rows}</table>
<p>Shipping to:<br>{"<br>".join(escape(part) for part in address_lines)}</p>
<p>We will email you again when your order ships.<br>Forge</p>
</body></html>"""
    return Mail(to=email, subject=f"Order {order.order_number} confirmed", text=text, html=html)


def send_order_confirmation(order_id: int) -> bool:
    """Returns False if the confirmation was already sent (or claimed by another worker)."""
    claimed = db.session.execute(
        update(Order)
        .where(Order.id == order_id, Order.confirmation_sent_at.is_(None))
        .values(confirmation_sent_at=datetime.now(UTC))
        .returning(Order.id)
    ).scalar_one_or_none()
    db.session.commit()
    if claimed is None:
        return False

    order = db.session.get(Order, order_id)
    email, first_name = db.session.execute(select(User.email, User.first_name).where(User.id == order.user_id)).one()
    mail = confirmation(order, email, first_name)
    db.session.commit()  # nothing held while talking to the mail server
    try:
        send(mail)
    except Exception:
        db.session.execute(update(Order).where(Order.id == order_id).values(confirmation_sent_at=None))
        db.session.commit()
        raise  # Celery retries with backoff
    return True
