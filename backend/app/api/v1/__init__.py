from flask import Blueprint

bp = Blueprint("api_v1", __name__)

from . import addresses, admin, auth, builds, cart, catalog, checkout, compatibility, health  # noqa: E402,F401
