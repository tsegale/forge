from flask import Blueprint

bp = Blueprint("api_v1", __name__)

from . import health  # noqa: E402,F401
