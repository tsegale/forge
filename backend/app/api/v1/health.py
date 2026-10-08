"""Liveness and readiness probes used by Docker healthchecks and the reverse proxy."""

from typing import Literal

import redis
from flask import current_app
from pydantic import BaseModel
from sqlalchemy import text

from ...extensions import db
from ..spec import api, responses
from . import bp

TAG = "Health"


class Liveness(BaseModel):
    """Liveness: the process is up and serving requests."""

    status: Literal["ok"]


class Readiness(BaseModel):
    """Readiness: PostgreSQL and Redis checked individually."""

    status: Literal["ok", "degraded"]
    checks: dict[str, Literal["ok", "unavailable"]]


@bp.get("/health/live")
@api.validate(resp=responses(HTTP_200=Liveness), tags=[TAG])
def live():
    """Liveness: the process is up and serving requests."""
    return {"status": "ok"}


@bp.get("/health/ready")
@api.validate(resp=responses(HTTP_200=Readiness, HTTP_503=Readiness), tags=[TAG])
def ready():
    """Readiness: PostgreSQL and Redis are reachable. 503 while any dependency is down."""
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
