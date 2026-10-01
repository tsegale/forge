"""Trigram search on product names, and refresh token families for reuse detection.

* pg_trgm plus a GIN trigram index on products.name lets catalog search match substrings
  and near misses that full-text search cannot ("x3d" finds "7800X3D").
* refresh_tokens.family_id groups every token rotated from a single login, so presenting an
  already-rotated token can revoke the whole family.

Revision ID: 0003
Revises: 0002
"""
import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.create_index(
        "ix_products_name_trgm",
        "products",
        ["name"],
        postgresql_using="gin",
        postgresql_ops={"name": "gin_trgm_ops"},
    )

    # Add nullable, backfill (each existing token becomes its own family), then enforce NOT NULL,
    # so the migration is safe on a populated table.
    op.add_column("refresh_tokens", sa.Column("family_id", sa.Uuid(), nullable=True))
    op.execute("UPDATE refresh_tokens SET family_id = jti")
    op.alter_column("refresh_tokens", "family_id", nullable=False)
    op.create_index(op.f("ix_refresh_tokens_family_id"), "refresh_tokens", ["family_id"])
    op.create_check_constraint(
        op.f("ck_refresh_tokens_replaced_by_requires_revoked"),
        "refresh_tokens",
        "replaced_by_jti IS NULL OR revoked_at IS NOT NULL",
    )


def downgrade():
    op.drop_constraint(op.f("ck_refresh_tokens_replaced_by_requires_revoked"), "refresh_tokens", type_="check")
    op.drop_index(op.f("ix_refresh_tokens_family_id"), table_name="refresh_tokens")
    op.drop_column("refresh_tokens", "family_id")
    op.drop_index("ix_products_name_trgm", table_name="products")
    op.execute("DROP EXTENSION IF EXISTS pg_trgm")
