"""Liveness and readiness probes used by Docker healthchecks and the reverse proxy."""

import redis
from flask import current_app
from sqlalchemy import text

from ...extensions import db
from . import bp


@bp.get("/health/live")
def live():
    return {"status": "ok"}


@bp.get("/health/ready")
def ready():
    checks: dict[str, str] = {}
    try:
        db.session.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception:  # noqa: BLE001  report, never raise, from a probe
        checks["database"] = "unavailable"
    try:
        redis.Redis.from_url(current_app.config["REDIS_URL"], socket_timeout=1).ping()
        checks["redis"] = "ok"
    except Exception:  # noqa: BLE001
        checks["redis"] = "unavailable"
    healthy = all(v == "ok" for v in checks.values())
    return {"status": "ok" if healthy else "degraded", "checks": checks}, 200 if healthy else 503
