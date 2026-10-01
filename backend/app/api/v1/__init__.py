from flask import Blueprint

bp = Blueprint("api_v1", __name__)

from . import (  # noqa: E402,F401
    addresses,
    admin,
    auth,
    builds,
    cart,
    catalog,
    checkout,
    compatibility,
    health,
    orders,
    webhooks,
)
