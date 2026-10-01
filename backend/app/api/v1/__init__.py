from flask import Blueprint

bp = Blueprint("api_v1", __name__)

from . import admin, auth, builds, catalog, compatibility, health  # noqa: E402,F401
