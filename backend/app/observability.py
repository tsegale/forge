"""Request logging and timing.

* Every log record carries the request's id (``X-Request-ID``: the client's or Nginx's when it is
  well formed, else generated in ``errors._assign_request_id``), so one line in an error
  message leads to every log line of that request.
* One access line per request: method, path (never the query string, which can hold search
  text or tokens), status, duration, user and request id. JSON in production, readable text in
  development (``LOG_FORMAT``).
* ``Server-Timing`` on every API response: time in the app, and time and statement count in
  PostgreSQL, from SQLAlchemy cursor events. Browser dev tools and the API Inspector show it.
  ``SERVER_TIMING=false`` turns it off.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any

from flask import Flask, Response, current_app, g, has_request_context, request
from sqlalchemy import event
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.engine import Engine

ACCESS = logging.getLogger("forge.access")


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = g.get("request_id", "-") if has_request_context() else "-"
        return True


class JsonFormatter(logging.Formatter):
    """One JSON object per line, for log shippers. Extra fields given with ``extra=`` are kept."""

    STANDARD = set(vars(logging.makeLogRecord({})))

    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, Any] = {
            "time": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        entry |= {k: v for k, v in vars(record).items() if k not in self.STANDARD and k != "message"}
        if record.exc_info:
            entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(entry, default=str)


def configure_logging(app: Flask) -> None:
    handler = logging.StreamHandler()
    handler.addFilter(RequestIdFilter())
    if app.config["LOG_FORMAT"] == "json":
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s [%(request_id)s] %(name)s: %(message)s"))
    root = logging.getLogger()
    # Replace rather than add, so app factories called repeatedly (tests) do not stack handlers.
    root.handlers = [h for h in root.handlers if not getattr(h, "_forge", False)]
    handler._forge = True  # type: ignore[attr-defined]  # marker for the line above
    root.addHandler(handler)
    root.setLevel(app.config["LOG_LEVEL"])


def _count_statements(engine: Engine) -> None:
    @event.listens_for(engine, "before_cursor_execute")
    def before(conn, cursor, statement, parameters, context, executemany):  # noqa: ANN001
        if has_request_context():
            conn.info.setdefault("forge_query_start", []).append(time.perf_counter())

    @event.listens_for(engine, "after_cursor_execute")
    def after(conn, cursor, statement, parameters, context, executemany):  # noqa: ANN001
        starts = conn.info.get("forge_query_start")
        if has_request_context() and starts:
            g.db_ms = g.get("db_ms", 0.0) + (time.perf_counter() - starts.pop()) * 1000
            g.db_queries = g.get("db_queries", 0) + 1


def _start_timer() -> None:
    g.started_at = time.perf_counter()
    g.db_ms, g.db_queries = 0.0, 0  # g can outlive a request (an app context pushed around it)


def _finish(response: Response) -> Response:
    started = g.get("started_at")
    if started is None:
        return response
    total_ms = (time.perf_counter() - started) * 1000
    if request.path.startswith("/api/") and current_app.config["SERVER_TIMING"]:
        db_ms, queries = g.get("db_ms", 0.0), g.get("db_queries", 0)
        response.headers["Server-Timing"] = (
            f'app;dur={total_ms:.1f};desc="Flask", db;dur={db_ms:.1f};desc="PostgreSQL, {queries} statements"'
        )
    user = g.get("current_user")
    # The identity key, not user.id: after the commit, touching an attribute would reload it.
    identity = sa_inspect(user).identity if user is not None else None
    ACCESS.info(
        "%s %s %s %.1fms",
        request.method,
        request.path,
        response.status_code,
        total_ms,
        extra={
            "method": request.method,
            "path": request.path,
            "status": response.status_code,
            "duration_ms": round(total_ms, 1),
            "db_ms": round(g.get("db_ms", 0.0), 1),
            "db_queries": g.get("db_queries", 0),
            "user_id": identity[0] if identity else None,
        },
    )
    return response


def init_app(app: Flask, engine: Engine) -> None:
    configure_logging(app)
    _count_statements(engine)
    # First of all before-request hooks, so their queries (session lookup, rate limits) count too.
    app.before_request_funcs.setdefault(None, []).insert(0, _start_timer)
    app.after_request(_finish)
