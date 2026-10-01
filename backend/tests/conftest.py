"""Tests run against a real PostgreSQL database migrated with Alembic, so triggers,
partitions and constraints are exercised exactly as in production. Each test runs
inside a transaction that is rolled back afterwards."""

import pytest
from flask_migrate import downgrade, upgrade
from sqlalchemy import select, text

from app import create_app
from app.cli import DEFAULT_SEED, load_catalog
from app.extensions import db
from app.models import Product


@pytest.fixture(scope="session")
def app():
    app = create_app("testing")
    with app.app_context():
        with db.engine.begin() as conn:  # start from an empty database every run
            conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public"))
        # Round-trip the migrations so every downgrade() is proven to work too.
        upgrade()
        downgrade(revision="base")
        upgrade()
        load_catalog(DEFAULT_SEED)
        yield app


@pytest.fixture()
def session(app):
    """Bind the scoped session to one outer transaction; app-level commits become savepoints."""
    connection = db.engine.connect()
    outer = connection.begin()
    original = db.session
    db.session = db._make_scoped_session({"bind": connection, "join_transaction_mode": "create_savepoint"})
    try:
        yield db.session
    finally:
        db.session.remove()
        db.session = original
        outer.rollback()
        connection.close()


@pytest.fixture()
def product_by_sku(session):
    def _get(sku: str) -> Product:
        return session.scalar(select(Product).where(Product.sku == sku))

    return _get
