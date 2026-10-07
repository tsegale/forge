"""Price-drop alerts for the signed-in customer."""

from __future__ import annotations

from flask import request

from ...schemas.alerts import PriceAlertCreate, PriceAlertList, PriceAlertResponse
from ...security.guards import current_user, require_auth
from ...services import price_alerts
from ..spec import api, responses
from . import bp

TAG = "Price alerts"
SECURITY = {"bearerAuth": []}


@bp.get("/alerts")
@require_auth
@api.validate(resp=responses(401, HTTP_200=PriceAlertList), tags=[TAG], security=SECURITY)
def list_alerts():
    """The customer's price alerts, newest first, with each product's current price."""
    return PriceAlertList(items=price_alerts.list_alerts(current_user()))


@bp.post("/alerts")
@require_auth
@api.validate(
    json=PriceAlertCreate, resp=responses(401, 422, HTTP_200=PriceAlertResponse), tags=[TAG], security=SECURITY
)
def set_alert():
    """Watch a product for a price at or below the target (below today's price). One alert per
    product: setting it again changes the target and re-arms it. One email when it fires."""
    return price_alerts.set_alert(current_user(), request.context.json)


@bp.delete("/alerts/<int:alert_id>")
@require_auth
@api.validate(resp=responses(401, 404, HTTP_204=None), tags=[TAG], security=SECURITY)
def delete_alert(alert_id: int):
    """Stop watching."""
    price_alerts.delete_alert(current_user(), alert_id)
    return "", 204
