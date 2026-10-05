"""Reference data and public runtime configuration."""

from __future__ import annotations

from flask import current_app
from sqlalchemy import select

from ...extensions import db
from ...models import ComponentKind
from ...schemas.meta import ComponentKindList, ComponentKindResponse, PublicConfig, ShippingSettings
from ..spec import api, responses
from . import bp

TAG = "Reference"


@bp.get("/component-kinds")
@api.validate(resp=responses(HTTP_200=ComponentKindList), tags=[TAG])
def component_kinds():
    """The kinds of part a build is made of, in display order, with per-build limits."""
    kinds = db.session.scalars(select(ComponentKind).order_by(ComponentKind.sort_order))
    return ComponentKindList(items=[ComponentKindResponse.model_validate(k) for k in kinds])


@bp.get("/config")
@api.validate(resp=responses(HTTP_200=PublicConfig), tags=[TAG])
def public_config():
    """Settings the browser needs at runtime. Contains nothing secret: the Stripe publishable key
    is public by design. Served at runtime so one image works in every environment."""
    cfg = current_app.config
    return PublicConfig(
        currency=cfg["STORE_CURRENCY"],
        vat_rate_bps=cfg["VAT_RATE_BPS"],
        shipping=ShippingSettings(
            flat_cents=cfg["SHIPPING_FLAT_CENTS"], free_threshold_cents=cfg["FREE_SHIPPING_THRESHOLD_CENTS"]
        ),
        reservation_ttl_seconds=int(cfg["RESERVATION_TTL"].total_seconds()),
        payment_provider=cfg["PAYMENT_GATEWAY"],
        stripe_publishable_key=cfg["STRIPE_PUBLISHABLE_KEY"] or None,
    )
