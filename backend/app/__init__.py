"""Forge API application factory."""

import os

from flask import Flask
from werkzeug.middleware.proxy_fix import ProxyFix

from .config import CONFIGS
from .extensions import db, limiter, migrate


def create_app(config_name: str | None = None) -> Flask:
    config_name = config_name or os.environ.get("FORGE_ENV", "development")
    app = Flask(__name__)
    app.config.from_object(CONFIGS[config_name]())
    app.config.setdefault("RATELIMIT_STORAGE_URI", app.config["REDIS_URL"])
    if app.config["TRUSTED_PROXY_COUNT"]:
        hops = app.config["TRUSTED_PROXY_COUNT"]
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=hops, x_proto=hops, x_host=hops)  # type: ignore[method-assign]

    db.init_app(app)
    from . import models  # noqa: F401  register mappers before Alembic inspects metadata

    migrate.init_app(app, db, compare_type=True)
    limiter.init_app(app)

    from .errors import register_error_handlers

    register_error_handlers(app)

    from .api.v1 import bp as api_v1

    app.register_blueprint(api_v1, url_prefix="/api/v1")

    from .api.spec import register_docs

    register_docs(app)

    from .cli import register_cli

    register_cli(app)
    return app
