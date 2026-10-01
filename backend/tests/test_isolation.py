"""The per-test transaction must contain application commits, or tests leak state into each other."""

from sqlalchemy import select, text

from app.extensions import db
from app.models import Brand


def test_application_commit_is_invisible_outside_the_test_transaction(session):
    db.session.add(Brand(name="Isolation Probe", slug="isolation-probe"))
    db.session.commit()  # what a service does; must only release a savepoint

    assert session.scalar(select(Brand.id).where(Brand.slug == "isolation-probe")) is not None
    with db.engine.connect() as independent:
        leaked = independent.execute(text("SELECT 1 FROM brands WHERE slug = 'isolation-probe'")).first()
    assert leaked is None
