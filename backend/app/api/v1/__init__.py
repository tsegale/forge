"""Version 1 of the REST API: one blueprint, one module per resource."""

from flask import Blueprint

bp = Blueprint("api_v1", __name__)

from . import (  # noqa: E402,F401
    addresses,
    admin,
    alerts,
    auth,
    builds,
    cart,
    catalog,
    checkout,
    compatibility,
    health,
    meta,
    orders,
    reviews,
    webhooks,
)
