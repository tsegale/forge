from flask import Blueprint

bp = Blueprint("api_v1", __name__)

from . import admin, auth, catalog, health  # noqa: E402,F401
