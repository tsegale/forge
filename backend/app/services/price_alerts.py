"""Price-drop alerts: a customer names a price; when the product reaches it, one email goes out.

An alert fires once. Setting it again (a new target) re-arms it. The sweep that sends the emails
runs from Celery Beat and right after an admin changes a price; each alert is claimed in a
committed UPDATE before the email is sent, so two workers never send the same one, and a failed
send releases the claim for the retry (the pattern used for order confirmations).
"""

from __future__ import annotations

from datetime import UTC, datetime
from html import escape

from flask import current_app
from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert

from ..errors import NotFound, ValidationFailed
from ..extensions import db
from ..models import PriceAlert, Product, User
from ..schemas.alerts import PriceAlertCreate, PriceAlertResponse
from ..schemas.catalog import Price
from .catalog import load_products, to_summary
from .mail import Mail, send
from .notifications import format_money


def _response(alert: PriceAlert, product: Product) -> PriceAlertResponse:
    return PriceAlertResponse(
        id=alert.id,
        product=to_summary(product),
        target=Price(amount_cents=alert.target_price_cents, currency=current_app.config["STORE_CURRENCY"]),
        triggered_at=alert.triggered_at,
        created_at=alert.created_at,
    )


def list_alerts(user: User) -> list[PriceAlertResponse]:
    alerts = db.session.scalars(
        select(PriceAlert).where(PriceAlert.user_id == user.id).order_by(PriceAlert.created_at.desc())
    ).all()
    products = load_products([a.product_id for a in alerts])
    return [_response(a, products[a.product_id]) for a in alerts]


def set_alert(user: User, data: PriceAlertCreate) -> PriceAlertResponse:
    """Create the alert, or move an existing one to a new target and re-arm it."""
    product = db.session.scalar(select(Product).where(Product.id == data.product_id, Product.is_active))
    if product is None:
        raise ValidationFailed(
            "That product is not sold.",
            details=[
                {"field": "product_id", "message": "No active product with this id.", "type": "product_unavailable"}
            ],
        )
    if data.target_price_cents >= product.price_cents:
        now = format_money(product.price_cents, current_app.config["STORE_CURRENCY"])
        raise ValidationFailed(
            "Choose a price below the current one.",
            details=[
                {
                    "field": "target_price_cents",
                    "message": f"The price is already {now}.",
                    "type": "target_not_below_price",
                }
            ],
        )
    stmt = insert(PriceAlert).values(user_id=user.id, product_id=product.id, target_price_cents=data.target_price_cents)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_price_alerts_user_product",
        set_={"target_price_cents": stmt.excluded.target_price_cents, "triggered_at": None, "updated_at": func.now()},
    ).returning(PriceAlert.id)
    alert_id = db.session.scalar(stmt)
    db.session.commit()
    alert = db.session.get(PriceAlert, alert_id)
    db.session.refresh(alert)
    return _response(alert, load_products([product.id])[product.id])


def delete_alert(user: User, alert_id: int) -> None:
    alert = db.session.get(PriceAlert, alert_id)
    if alert is None or alert.user_id != user.id:
        raise NotFound("Price alert not found.")
    db.session.delete(alert)
    db.session.commit()


def due_alert_ids(product_id: int | None = None) -> list[int]:
    """Armed alerts whose product is on sale at or below the target."""
    stmt = (
        select(PriceAlert.id)
        .join(Product, Product.id == PriceAlert.product_id)
        .where(
            PriceAlert.triggered_at.is_(None),
            Product.is_active,
            Product.price_cents <= PriceAlert.target_price_cents,
        )
        .order_by(PriceAlert.id)
    )
    if product_id is not None:
        stmt = stmt.where(PriceAlert.product_id == product_id)
    return list(db.session.scalars(stmt))


def drop_mail(user: User, product: Product, target_cents: int) -> Mail:
    currency = current_app.config["STORE_CURRENCY"]
    price, target = format_money(product.price_cents, currency), format_money(target_cents, currency)
    link = f"{current_app.config['PUBLIC_BASE_URL']}/products/{product.slug}"
    text = (
        f"Hi {user.first_name},\n\nThe {product.name} is now {price}, at or below the {target} you asked us to "
        f"watch for.\n\n{link}\n\nPrices can change again, and stock is not held until you check out.\n\nForge"
    )
    html = (
        '<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#18181b">'
        f"<p>Hi {escape(user.first_name)},</p>"
        f"<p>The <strong>{escape(product.name)}</strong> is now <strong>{price}</strong>, at or below the "
        f"{target} you asked us to watch for.</p>"
        f'<p><a href="{link}" style="color:#1e4fa8">See the {escape(product.name)}</a></p>'
        "<p>Prices can change again, and stock is not held until you check out.</p><p>Forge</p></div>"
    )
    return Mail(to=user.email, subject=f"Price drop: {product.name} is now {price}", text=text, html=html)


def send_alert(alert_id: int) -> bool:
    """Claim, commit, send. False if another run already sent it or the drop no longer holds."""
    claimed = db.session.execute(
        update(PriceAlert)
        .where(
            PriceAlert.id == alert_id,
            PriceAlert.triggered_at.is_(None),
            PriceAlert.product_id.in_(
                select(Product.id).where(Product.is_active, Product.price_cents <= PriceAlert.target_price_cents)
            ),
        )
        .values(triggered_at=datetime.now(UTC))
        .returning(PriceAlert.user_id, PriceAlert.product_id, PriceAlert.target_price_cents)
    ).one_or_none()
    db.session.commit()
    if claimed is None:
        return False
    user_id, product_id, target = claimed
    mail = drop_mail(db.session.get(User, user_id), db.session.get(Product, product_id), target)
    db.session.commit()  # nothing held while talking to the mail server
    try:
        send(mail)
    except Exception:
        db.session.execute(update(PriceAlert).where(PriceAlert.id == alert_id).values(triggered_at=None))
        db.session.commit()
        raise
    return True


def sweep(product_id: int | None = None) -> int:
    """Send every due alert (optionally for one product). Returns how many emails went out."""
    return sum(send_alert(alert_id) for alert_id in due_alert_ids(product_id))
