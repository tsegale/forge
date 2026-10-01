"""Tests run against a real PostgreSQL database migrated with Alembic, so triggers,
partitions and constraints are exercised exactly as in production. Each test runs
inside a transaction that is rolled back afterwards."""

import pytest
from flask_migrate import downgrade, upgrade
from flask_sqlalchemy.session import Session as FlaskSQLAlchemySession
from sqlalchemy import select, text

from app import create_app
from app.cli import DEFAULT_SEED, load_catalog
from app.extensions import db
from app.models import Product, User
from app.models.enums import UserRole
from app.security.passwords import hash_password
from app.security.tokens import issue_access_token


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


class _ConnectionBoundSession(FlaskSQLAlchemySession):
    """Flask-SQLAlchemy's Session.get_bind resolves each mapper to the app *engine* and only
    falls back to the session-level bind, so a plain ``bind=connection`` is silently ignored for
    ORM statements and their commits escape the test transaction. Always use the test connection."""

    def get_bind(self, mapper=None, clause=None, bind=None, **kwargs):
        return self.bind


@pytest.fixture()
def session(app):
    """Bind the scoped session to one outer transaction; app-level commits become savepoints."""
    connection = db.engine.connect()
    outer = connection.begin()
    original = db.session
    db.session = db._make_scoped_session(
        {"bind": connection, "join_transaction_mode": "create_savepoint", "class_": _ConnectionBoundSession}
    )
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


DEFAULT_PASSWORD = "correct horse battery staple"


@pytest.fixture()
def client(app, session):
    """Test client whose requests run inside the per-test transaction."""
    return app.test_client()


@pytest.fixture()
def make_user(session):
    password_hash = hash_password(DEFAULT_PASSWORD)  # hash once; Argon2 is deliberately slow
    counter = iter(range(1, 10_000))

    def _make(*, email: str | None = None, role: UserRole = UserRole.CUSTOMER, is_active: bool = True) -> User:
        user = User(
            email=email or f"user{next(counter)}@example.com",
            password_hash=password_hash,
            first_name="Test",
            last_name="User",
            role=role,
            is_active=is_active,
        )
        session.add(user)
        session.flush()
        return user

    return _make


@pytest.fixture()
def auth_headers(app):
    def _headers(user) -> dict[str, str]:
        with app.app_context():
            token = issue_access_token(user.id, user.role.value).token
        return {"Authorization": f"Bearer {token}"}

    return _headers
