"""Forge API application factory."""

import os

from flask import Flask

from .config import CONFIGS
from .extensions import db, migrate


def create_app(config_name: str | None = None) -> Flask:
    config_name = config_name or os.environ.get("FORGE_ENV", "development")
    app = Flask(__name__)
    app.config.from_object(CONFIGS[config_name]())

    db.init_app(app)
    from . import models  # noqa: F401  register mappers before Alembic inspects metadata

    migrate.init_app(app, db, compare_type=True)

    from .api.v1 import bp as api_v1

    app.register_blueprint(api_v1, url_prefix="/api/v1")

    from .cli import register_cli

    register_cli(app)
    return app
